-- =====================================================================
-- FALA, VASCÃO! — estrutura do banco no Supabase (PostgreSQL)
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo › Run.
-- Pode ser executado mais de uma vez sem estragar nada (idempotente).
--
-- Princípios de segurança (OWASP A01 / API1 / API5, CWE-284, CWE-639):
--   • RLS ligado em TODAS as tabelas; nada é acessível sem uma política.
--   • Conteúdo editorial: leitura pública; escrita só para administradores.
--   • Perfil e gestões salvas: cada pessoa só vê e altera os próprios.
--   • Quem é admin fica na tabela `admins`, que NINGUÉM altera pelo site:
--     só pelo SQL Editor (evita escalada de privilégio, CWE-269).
--   • LGPD: não guardamos data de nascimento, CPF, endereço nem telefone.
--     Guardamos só o momento em que a pessoa confirmou ter 13 anos ou mais.
-- =====================================================================

-- ---------- Tabelas ----------

-- Conteúdo editorial: uma linha por registro de cada coleção do SEED.
create table if not exists public.content (
  collection  text        not null check (collection in (
                'news','history','titles','presidents','players','seasons','matches',
                'lineups','quiz','mysteries','careers','photos','videos','sources')),
  id          text        not null check (char_length(id) between 1 and 80),
  data        jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 300000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid() references auth.users(id) on delete set null,
  primary key (collection, id)
);

-- Configurações do site: 'meta' (snapshot da temporada, classificação, técnico, RSS)
-- e 'curiosities' (lista de curiosidades do dia).
create table if not exists public.site_settings (
  key         text        primary key check (key in ('meta','curiosities')),
  data        jsonb       not null check (pg_column_size(data) < 300000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid        default auth.uid() references auth.users(id) on delete set null
);

-- Quem é administrador. Só é alterada pelo SQL Editor do Supabase.
create table if not exists public.admins (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Perfil do torcedor (privado). E-mail e senha ficam no Supabase Auth, não aqui.
create table if not exists public.profiles (
  user_id           uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  login             text        not null unique check (login ~ '^[a-zA-Z0-9_.]{3,20}$'),
  display_name      text        not null check (char_length(display_name) between 1 and 60),
  age_confirmed_at  timestamptz not null default now(),
  progress          jsonb       not null default '{}'::jsonb
                    check (jsonb_typeof(progress) = 'object' and pg_column_size(progress) < 200000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Gestões salvas do modo "Seja o Lamachia" (privadas, por dono).
create table if not exists public.manager_teams (
  owner       uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id          text        not null check (char_length(id) between 1 and 80),
  data        jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 100000),
  created_at  timestamptz not null default now(),
  primary key (owner, id)
);

-- ---------- Funções auxiliares ----------

-- true se quem está logado é administrador.
-- SECURITY DEFINER para poder ler `admins` sem abrir a tabela; search_path vazio
-- evita sequestro de função (CWE-426).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

-- Atualiza `updated_at` automaticamente.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_content_touch  on public.content;
drop trigger if exists trg_settings_touch on public.site_settings;
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_content_touch  before update on public.content       for each row execute function public.touch_updated_at();
create trigger trg_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();
create trigger trg_profiles_touch before update on public.profiles      for each row execute function public.touch_updated_at();

-- LGPD (art. 18, VI): a própria pessoa apaga a conta e todos os dados ligados a ela.
-- Os dados em profiles/manager_teams somem junto (on delete cascade).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'não autenticado';
  end if;
  delete from auth.users where id = (select auth.uid());
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Permissões base (defesa em profundidade) ----------
-- O Supabase dá acesso amplo por padrão; reduzimos ao mínimo e o RLS faz o resto.
revoke all on public.content, public.site_settings, public.admins, public.profiles, public.manager_teams from anon, authenticated;
grant select                         on public.content, public.site_settings to anon, authenticated;
grant insert, update, delete         on public.content, public.site_settings to authenticated;
grant select                         on public.admins                        to authenticated;
grant select, insert, update, delete on public.profiles, public.manager_teams to authenticated;

-- ---------- RLS ----------
alter table public.content       enable row level security;
alter table public.site_settings enable row level security;
alter table public.admins        enable row level security;
alter table public.profiles      enable row level security;
alter table public.manager_teams enable row level security;

-- Conteúdo: todos leem; só admin escreve.
drop policy if exists content_read        on public.content;
drop policy if exists content_admin_write on public.content;
create policy content_read        on public.content for select to anon, authenticated using (true);
create policy content_admin_write on public.content for all    to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists settings_read        on public.site_settings;
drop policy if exists settings_admin_write on public.site_settings;
create policy settings_read        on public.site_settings for select to anon, authenticated using (true);
create policy settings_admin_write on public.site_settings for all    to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Admins: cada um só consegue ver a PRÓPRIA linha (para o site saber se mostra o painel).
-- Não há política de insert/update/delete: pelo site ninguém vira admin.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Perfis: dono lê e altera o próprio; admin pode LER todos (lista de usuários no painel).
drop policy if exists profiles_owner_all  on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_owner_all  on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profiles_admin_read on public.profiles for select to authenticated
  using ((select public.is_admin()));

-- Gestões salvas: só o dono.
drop policy if exists teams_owner_all on public.manager_teams;
create policy teams_owner_all on public.manager_teams for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

-- =====================================================================
-- DEPOIS de criar a SUA conta no site, rode UMA vez (troque o e-mail):
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'seu-email@exemplo.com'
--   on conflict do nothing;
-- =====================================================================
