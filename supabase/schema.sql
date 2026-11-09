-- SOLTE MEU AWARDS — rode TUDO no Supabase > SQL Editor > New query > Run
create extension if not exists pgcrypto;

-- ===== Tabelas =====
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  -- etapas: categories_open -> categories_closed -> (futuro) winners_open -> winners_closed
  stage text not null default 'categories_open'
    check (stage in ('categories_open','categories_closed','winners_open','winners_closed'))
);
insert into public.app_settings (id) values (1);

create table public.admins (user_id uuid primary key references auth.users on delete cascade);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid(),
  name text not null check (char_length(name) between 2 and 40),
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored unique,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 40),
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored unique,
  suggested_by uuid references public.participants on delete set null,
  is_official boolean not null default false,   -- marcada ao encerrar a etapa 1
  created_at timestamptz not null default now()
);

create table public.category_selections (
  participant_id uuid not null references public.participants on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  created_at timestamptz not null default now(),
  primary key (participant_id, category_id)
);

-- Etapa 2 (futuro): votos nos vencedores. Sem políticas = bloqueada até ser implementada.
create table public.winner_votes (
  participant_id uuid not null references public.participants on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  nominee_participant_id uuid not null references public.participants on delete cascade,
  created_at timestamptz not null default now(),
  primary key (participant_id, category_id)
);

create view public.category_ranking with (security_invoker = true) as
  select c.id, c.name, c.is_official, c.suggested_by, c.created_at,
         count(s.category_id)::int as votes
  from public.categories c
  left join public.category_selections s on s.category_id = c.id
  group by c.id;

-- ===== Funções =====
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

create function public.guard_participant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
    new.finalized_at := null;
    return new;
  end if;
  if new.name <> old.name or new.user_id <> old.user_id or new.id <> old.id then
    raise exception 'Dados do participante não podem ser alterados.';
  end if;
  if new.finalized_at is distinct from old.finalized_at then
    if old.finalized_at is not null then raise exception 'Sua votação já foi finalizada.'; end if;
    if (select stage from app_settings where id = 1) <> 'categories_open' then
      raise exception 'A primeira etapa foi encerrada.'; end if;
    if not exists (select 1 from category_selections where participant_id = old.id) then
      raise exception 'Selecione ao menos uma categoria antes de finalizar.'; end if;
    new.finalized_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard_participant before insert or update on public.participants
  for each row execute function public.guard_participant();

create function public.guard_selection() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; fin timestamptz;
begin
  pid := case when tg_op = 'DELETE' then old.participant_id else new.participant_id end;
  select finalized_at into fin from participants where id = pid for update;
  if fin is not null then raise exception 'Sua votação já foi finalizada.'; end if;
  if (select stage from app_settings where id = 1) <> 'categories_open' then
    raise exception 'A primeira etapa foi encerrada.'; end if;
  if tg_op = 'INSERT' and
     (select count(*) from category_selections where participant_id = pid) >= 15 then
    raise exception 'Limite de 15 categorias atingido.'; end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_selection before insert or delete on public.category_selections
  for each row execute function public.guard_selection();

create function public.suggest_category(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; fin timestamptz; cid uuid;
        n text := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
begin
  select id, finalized_at into pid, fin from participants where user_id = auth.uid();
  if pid is null then raise exception 'Cadastre-se antes de sugerir.'; end if;
  if fin is not null then raise exception 'Sua votação já foi finalizada.'; end if;
  if (select stage from app_settings where id = 1) <> 'categories_open' then
    raise exception 'A primeira etapa foi encerrada.'; end if;
  if char_length(n) not between 3 and 40 then
    raise exception 'A categoria deve ter de 3 a 40 caracteres.'; end if;
  if exists (select 1 from categories where name_key = lower(n)) then
    raise exception 'Essa categoria já existe na lista.'; end if;
  insert into categories (name, suggested_by) values (n, pid) returning id into cid;
  insert into category_selections (participant_id, category_id) values (pid, cid); -- falha se já tem 15
  return cid;
end $$;

create function public.close_stage1() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Acesso negado.'; end if;
  update categories set is_official = false;
  update categories set is_official = true where id in (
    select c.id from categories c left join category_selections s on s.category_id = c.id
    group by c.id order by count(s.category_id) desc, c.created_at limit 15);
  update app_settings set stage = 'categories_closed' where id = 1;
end $$;

-- ===== RLS =====
alter table public.app_settings enable row level security;
alter table public.admins enable row level security;
alter table public.participants enable row level security;
alter table public.categories enable row level security;
alter table public.category_selections enable row level security;
alter table public.winner_votes enable row level security;

create policy settings_read on public.app_settings for select to authenticated using (true);
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());

create policy part_select on public.participants for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy part_insert on public.participants for insert to authenticated
  with check (user_id = auth.uid());
create policy part_update on public.participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy part_admin_delete on public.participants for delete to authenticated
  using (public.is_admin());

-- Categorias: todos leem; criação só via suggest_category(); admin gerencia
create policy cat_read on public.categories for select to authenticated using (true);
create policy cat_admin on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy sel_select on public.category_selections for select to authenticated
  using (public.is_admin() or participant_id in (select id from public.participants where user_id = auth.uid()));
create policy sel_insert on public.category_selections for insert to authenticated
  with check (participant_id in (select id from public.participants where user_id = auth.uid()));
create policy sel_delete on public.category_selections for delete to authenticated
  using (participant_id in (select id from public.participants where user_id = auth.uid()));

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_admin(), public.suggest_category(text), public.close_stage1() to authenticated;

-- ===== Realtime =====
alter publication supabase_realtime add table public.categories, public.app_settings;

-- ===== Categorias iniciais =====
insert into public.categories (name) values
 ('Mais Urubu'),('Mais FDP'),('Vai ser pego na Croco'),('Mais Vida Mansa'),
 ('Trabalho Mais Pesado'),('Mais Liso'),('Fígado de Ferro'),('Solte Minha Camisa'),
 ('Melhor Motorista'),('Menos Urubu'),('Mais Sumido'),('Mais Rico')
on conflict (name_key) do nothing;
