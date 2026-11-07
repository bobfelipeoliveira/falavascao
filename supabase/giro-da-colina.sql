-- =====================================================================
-- GIRO DA COLINA — robô de notícias do Fala, Vascão!
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo › Run.
-- Pode ser executado mais de uma vez (idempotente). Rode DEPOIS de schema.sql.
--
-- O que guardamos de cada notícia (e o que NÃO guardamos):
--   ✔ título publicado pela fonte (citação com crédito), veículo, horário, link original
--   ✔ categoria e grau de confirmação (classificação automática, corrigível pelo admin)
--   ✔ resumo PRÓPRIO, quando o admin escrever um (ou IA, se ativada no futuro)
--   ✘ texto, trechos ou imagens das matérias — nada é copiado das fontes
--
-- Segurança (OWASP API1/API5, CWE-284, CWE-918):
--   • RLS em todas as tabelas. Leitura pública só do que não está oculto; escrita só admin.
--   • O robô grava com a chave secreta que existe APENAS dentro do Supabase (Edge Function).
--   • Feeds só https, cadastrados pelo admin (o robô ainda bloqueia IPs/hosts internos: SSRF).
-- =====================================================================

create table if not exists public.news_sources (
  id            text        primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  name          text        not null check (char_length(name) between 2 and 80),
  site_url      text        check (site_url is null or (site_url ~ '^https://' and char_length(site_url) < 300)),
  feed_url      text        not null check (feed_url ~ '^https://' and char_length(feed_url) < 600),
  kind          text        not null default 'rss' check (kind in ('rss','google')),
  reliability   text        not null default 'imprensa' check (reliability in ('oficial','imprensa','blog','agregador')),
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_fetch_at timestamptz,
  last_ok       boolean,
  last_error    text        check (last_error is null or char_length(last_error) <= 300),
  last_count    integer
);

create table if not exists public.news_items (
  id            uuid        primary key default gen_random_uuid(),
  url           text        not null unique check (url ~ '^https?://' and char_length(url) < 2000),
  title         text        not null check (char_length(title) between 3 and 300),
  publisher     text        not null check (char_length(publisher) between 1 and 80),
  source_id     text        references public.news_sources(id) on delete set null,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  category      text        not null check (category in ('mercado','bastidores','profissional','base','feminino','diretoria','medico','historia')),
  status        text        not null check (status in ('confirmado','apuracao','rumor')),
  cluster_id    uuid        not null,
  cluster_size  integer     not null default 1 check (cluster_size between 1 and 100),
  summary       text        check (summary is null or char_length(summary) <= 400),
  summary_kind  text        check (summary_kind is null or summary_kind in ('admin','ia')),
  featured      boolean     not null default false,
  hidden        boolean     not null default false,
  manual        boolean     not null default false   -- admin corrigiu: o robô não sobrescreve categoria/status
);
create index if not exists news_items_published_idx on public.news_items (published_at desc);
create index if not exists news_items_cluster_idx   on public.news_items (cluster_id);

create table if not exists public.news_runs (
  id            bigint      generated always as identity primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  trigger       text        not null default 'cron' check (trigger in ('cron','visitante','admin')),
  sources_ok    integer     not null default 0,
  sources_fail  integer     not null default 0,
  items_new     integer     not null default 0,
  error         text        check (error is null or char_length(error) <= 300)
);
create index if not exists news_runs_started_idx on public.news_runs (started_at desc);

-- updated_at automático (função criada em schema.sql)
drop trigger if exists trg_sources_touch on public.news_sources;
create trigger trg_sources_touch before update on public.news_sources for each row execute function public.touch_updated_at();

-- ---------- Permissões base ----------
revoke all on public.news_sources, public.news_items, public.news_runs from anon, authenticated;
grant select on public.news_sources, public.news_items, public.news_runs to anon, authenticated;
grant insert, update, delete on public.news_sources to authenticated;
grant update, delete on public.news_items to authenticated;

-- ---------- RLS ----------
alter table public.news_sources enable row level security;
alter table public.news_items   enable row level security;
alter table public.news_runs    enable row level security;

drop policy if exists sources_read        on public.news_sources;
drop policy if exists sources_admin_write on public.news_sources;
create policy sources_read        on public.news_sources for select to anon, authenticated using (true);
create policy sources_admin_write on public.news_sources for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists items_read_visible on public.news_items;
drop policy if exists items_admin_read   on public.news_items;
drop policy if exists items_admin_update on public.news_items;
drop policy if exists items_admin_delete on public.news_items;
create policy items_read_visible on public.news_items for select to anon, authenticated using (hidden = false);
create policy items_admin_read   on public.news_items for select to authenticated using ((select public.is_admin()));
create policy items_admin_update on public.news_items for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy items_admin_delete on public.news_items for delete to authenticated using ((select public.is_admin()));

drop policy if exists runs_read on public.news_runs;
create policy runs_read on public.news_runs for select to anon, authenticated using (true);

-- ---------- Fontes iniciais (verificadas em 07/11/2026) ----------
insert into public.news_sources (id, name, site_url, feed_url, kind, reliability) values
  ('netvasco',     'NetVasco',          'https://www.netvasco.com.br/', 'https://www.netvasco.com.br/news/rss.xml',          'rss',    'imprensa'),
  ('ge',           'ge',                'https://ge.globo.com/futebol/times/vasco/', 'https://ge.globo.com/rss/ge/futebol/times/vasco/', 'rss', 'imprensa'),
  ('supervasco',   'SuperVasco',        'https://www.supervasco.com/',  'https://www.supervasco.com/feed/',                  'rss',    'blog'),
  ('paponacolina', 'Papo na Colina',    'https://paponacolina.com.br/', 'https://paponacolina.com.br/feed/',                 'rss',    'blog'),
  ('lance',        'LANCE!',            'https://www.lance.com.br/',    'https://news.google.com/rss/search?q=Vasco%20site%3Alance.com.br&hl=pt-BR&gl=BR&ceid=BR:pt-419', 'google', 'imprensa'),
  ('espn',         'ESPN',              'https://www.espn.com.br/',     'https://news.google.com/rss/search?q=Vasco%20site%3Aespn.com.br&hl=pt-BR&gl=BR&ceid=BR:pt-419',  'google', 'imprensa'),
  ('google',       'Google Notícias',   'https://news.google.com/',     'https://news.google.com/rss/search?q=%22Vasco%22%20futebol&hl=pt-BR&gl=BR&ceid=BR:pt-419',       'google', 'agregador')
on conflict (id) do nothing;
