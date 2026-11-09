# SOLTE MEU AWARDS

React + TypeScript + Supabase, hospedado na Netlify. Etapa 1: escolha das 15 categorias oficiais.

## 1. Supabase
1. https://supabase.com → **New project** (anote a senha do banco).
2. **SQL Editor → New query** → cole todo o `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Anonymous Sign-Ins → ative** (é como o site "reconhece" cada participante).
4. **Authentication → Users → Add user → Create new user**: seu e-mail e senha de admin (marque *Auto Confirm*).
5. No SQL Editor rode (troque o e-mail):
   `insert into public.admins (user_id) select id from auth.users where email = 'SEU@EMAIL.COM';`
6. **Project Settings → API**: copie a **Project URL** e a chave **anon/publishable** (nunca a `service_role`).

## 2. Rodar local (opcional)
`cp .env.example .env` → preencha → `npm install && npm run dev`

## 3. Netlify
**Via GitHub (recomendado):** suba o projeto no GitHub → Netlify → *Add new site → Import from Git* → escolha o repositório (o `netlify.toml` já define build e redirecionamentos) → *Site configuration → Environment variables* → adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` → *Deploy*. Em *Site configuration → Change site name* escolha `solte-meu-awards`.

**Via CLI:** `npm i -g netlify-cli && netlify login && netlify init` e depois `netlify env:set VITE_SUPABASE_URL ...`, `netlify env:set VITE_SUPABASE_ANON_KEY ...`, `netlify deploy --build --prod`.

(Arrastar a pasta `dist` também funciona, mas só depois de criar o `.env` e rodar `npm run build`.)

## Uso
- Participantes: `https://SEU-SITE.netlify.app`
- Admin: `https://SEU-SITE.netlify.app/admin`

## Notas
- O participante é reconhecido pela sessão do navegador. Se limpar os dados do navegador ou trocar de aparelho, o nome fica "ocupado": o admin libera em **Participantes → Remover**.
- Segurança no banco: RLS em todas as tabelas, limite de 15, bloqueio após finalizar/encerrar, duplicidade (nome/categoria) e criação de categorias apenas via função `suggest_category`, tudo validado no PostgreSQL.
- Etapa 2: já existem `app_settings.stage` (`winners_open/closed`), `categories.is_official` e a tabela `winner_votes` (bloqueada por RLS até ser implementada).
