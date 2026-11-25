-- FASE 2 — votação dos vencedores. Rode no SQL Editor depois do schema.sql.

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored unique,
  photo_path text,
  created_at timestamptz not null default now()
);
create table public.member_credentials (
  member_id uuid primary key references public.members on delete cascade,
  password_hash text not null
);
create table public.member_sessions (
  user_id uuid primary key,
  member_id uuid not null references public.members on delete cascade
);
drop table if exists public.winner_votes;
create table public.winner_votes (
  id uuid primary key default gen_random_uuid(),
  voter_user_id uuid not null,
  member_voter_id uuid references public.members on delete cascade,  -- null = voto popular
  category_id uuid not null references public.categories on delete cascade,
  nominee_id uuid not null references public.members on delete cascade,
  created_at timestamptz not null default now(),
  unique (voter_user_id, category_id)
);
create unique index winner_votes_member_cat on public.winner_votes (member_voter_id, category_id)
  where member_voter_id is not null;
create table public.admin_recovery (id int primary key default 1 check (id = 1), code_hash text not null);
alter table public.categories add column if not exists official_position int;

-- ===== RLS =====
alter table public.members enable row level security;
alter table public.member_credentials enable row level security;   -- sem políticas: só funções
alter table public.member_sessions enable row level security;
alter table public.winner_votes enable row level security;
alter table public.admin_recovery enable row level security;       -- sem políticas: só funções
create policy members_read on public.members for select to authenticated using (true);
create policy members_admin on public.members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy msess_self on public.member_sessions for select to authenticated using (user_id = auth.uid());
create policy wv_select on public.winner_votes for select to authenticated using (
  voter_user_id = auth.uid() or public.is_admin()
  or member_voter_id in (select member_id from public.member_sessions where user_id = auth.uid()));
revoke all on all tables in schema public from anon;

-- ===== Funções =====
create function public.member_login(p_member uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if not exists (select 1 from member_credentials where member_id = p_member and password_hash = crypt(p_password, password_hash)) then
    perform pg_sleep(1); raise exception 'Senha incorreta.';
  end if;
  insert into member_sessions (user_id, member_id) values (auth.uid(), p_member)
    on conflict (user_id) do update set member_id = excluded.member_id;
end $$;

create function public.cast_vote(p_category uuid, p_nominee uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.'; end if;
  if (select stage from app_settings where id = 1) <> 'winners_open' then raise exception 'A votação não está aberta.'; end if;
  if not exists (select 1 from categories where id = p_category and is_official) then raise exception 'Indicação inválida.'; end if;
  if not exists (select 1 from members where id = p_nominee) then raise exception 'Participante inválido.'; end if;
  select member_id into mid from member_sessions where user_id = auth.uid();
  insert into winner_votes (voter_user_id, member_voter_id, category_id, nominee_id) values (auth.uid(), mid, p_category, p_nominee);
exception when unique_violation then raise exception 'Você já votou nesta indicação.';
end $$;

create function public.phase2_categories() returns table (id uuid, title text, pos int)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce(nullif(btrim(c.replaced_by_text), ''), r.name, c.name), c.official_position
  from categories c left join categories r on r.id = c.replaced_by
  where c.is_official order by c.official_position nulls last, c.name $$;

create function public.set_stage(p_stage text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if not is_admin() then raise exception 'Acesso negado.'; end if;
  select stage into cur from app_settings where id = 1;
  if p_stage = 'winners_open' then
    if cur = 'categories_open' then raise exception 'Encerre a votação da fase 1 antes de abrir a fase 2.'; end if;
    if not exists (select 1 from categories where is_official) then raise exception 'Não há categorias oficiais.'; end if;
    if not exists (select 1 from members) then raise exception 'Cadastre os membros antes de abrir a votação.'; end if;
  elsif p_stage = 'winners_closed' then
    if cur <> 'winners_open' then raise exception 'A fase 2 não está aberta.'; end if;
  else raise exception 'Etapa inválida.'; end if;
  update app_settings set stage = p_stage where id = 1;
end $$;

create function public.winner_results() returns table (category_id uuid, nominee_id uuid, member_votes int, popular_votes int)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Acesso negado.'; end if;
  return query select v.category_id, v.nominee_id,
    (count(*) filter (where v.member_voter_id is not null))::int, (count(*) filter (where v.member_voter_id is null))::int
    from winner_votes v group by v.category_id, v.nominee_id;
end $$;

create function public.winner_summary() returns table (member_voters int, popular_voters int)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Acesso negado.'; end if;
  return query select (count(distinct v.member_voter_id))::int,
    (count(distinct v.voter_user_id) filter (where v.member_voter_id is null))::int from winner_votes v;
end $$;

create function public.admin_set_member_password(p_member uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'Acesso negado.'; end if;
  if char_length(coalesce(p_password, '')) < 4 then raise exception 'A senha precisa ter ao menos 4 caracteres.'; end if;
  insert into member_credentials (member_id, password_hash) values (p_member, crypt(p_password, gen_salt('bf')))
    on conflict (member_id) do update set password_hash = excluded.password_hash;
end $$;

-- "Esqueci minha senha" do admin: exige a chave de recuperação (sem e-mail)
create function public.admin_reset_password(p_code text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if char_length(coalesce(p_new, '')) < 6 then raise exception 'A nova senha deve ter ao menos 6 caracteres.'; end if;
  if not exists (select 1 from admin_recovery where id = 1 and code_hash = crypt(upper(btrim(coalesce(p_code, ''))), code_hash)) then
    perform pg_sleep(2); raise exception 'Chave de recuperação incorreta.';
  end if;
  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now()
    where id in (select user_id from admins);
end $$;
-- (a chave é gravada à parte: insert into admin_recovery values (1, crypt(upper('SUA-CHAVE'), gen_salt('bf'))))

-- Fase 1: guarda a posição final das 15 oficiais
create or replace function public.close_stage1() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Acesso negado.'; end if;
  update categories set is_official = false, official_position = null where is_official;
  with r as (
    select c.id, row_number() over (order by count(s.category_id) desc, c.tiebreak desc, c.created_at) rn
    from categories c left join category_selections s on s.category_id = c.id group by c.id)
  update categories c set is_official = true, official_position = r.rn from r where c.id = r.id and r.rn <= 15;
  update app_settings set stage = 'categories_closed' where id = 1;
end $$;

-- Permissões
revoke execute on function public.member_login(uuid,text), public.cast_vote(uuid,uuid), public.phase2_categories(),
  public.set_stage(text), public.winner_results(), public.winner_summary(), public.admin_set_member_password(uuid,text),
  public.admin_reset_password(text,text), public.close_stage1() from public, anon;
grant execute on function public.member_login(uuid,text), public.cast_vote(uuid,uuid), public.phase2_categories(),
  public.set_stage(text), public.winner_results(), public.winner_summary(), public.admin_set_member_password(uuid,text),
  public.close_stage1() to authenticated;
grant execute on function public.admin_reset_password(text,text) to anon, authenticated;

-- Fotos dos membros (bucket público; só o admin envia/remove)
insert into storage.buckets (id, name, public) values ('member-photos', 'member-photos', true) on conflict (id) do nothing;
create policy member_photos_admin on storage.objects for all to authenticated
  using (bucket_id = 'member-photos' and public.is_admin()) with check (bucket_id = 'member-photos' and public.is_admin());
