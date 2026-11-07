# CLAUDE.md — FALA, VASCÃO!

Memória do projeto para o Claude Code. Leia antes de qualquer tarefa.

## O que é
Plataforma de fãs do Club de Regatas Vasco da Gama: enciclopédia histórica, notícias, estatísticas,
8 jogos (Game Center), modo gestor ("Seja o Lamachia"), perfil, comunidade e painel admin.
Idioma da interface e das respostas ao dono: **português do Brasil**. O dono não é programador:
explique em linguagem simples e peça confirmação antes de mudanças grandes.

## Estado atual (v1.2)
- Tudo em `index.html` (HTML + CSS + JS puro, sem build). Abre direto no navegador.
- Publicado em https://bobfelipeoliveira.github.io/falavascao/ (repositório público `bobfelipeoliveira/falavascao`).
  O dono publica pelo GitHub Desktop (Commit to main → Push origin); a pasta local já é um repositório Git.
- **Modo online (Supabase)**: projeto `zrjlmwpcslaglophkonk`. Módulo `Cloud` (fetch puro, sem biblioteca) faz
  login/cadastro/recuperação pelo Supabase Auth, lê o conteúdo das tabelas `content`/`site_settings` e grava
  o progresso em `profiles`. Estrutura e RLS em `supabase/schema.sql`. Admin = linha na tabela `admins`
  (só via SQL Editor). Sem `fetch` (testes jsdom) ou sem conexão → cai no modo local.
- `localStorage` (chave `falavascao:db`) segue como cache offline; no modo local o login é DEMONSTRATIVO.
- Gestões salvas do modo gestor ainda ficam só no navegador (tabela `manager_teams` já existe, falta ligar).
- 4 visuais (skins) via `data-skin` no `<html>`: classico, app, game, editorial. Tema claro/escuro via `data-theme`.
- Dados atuais: snapshot de 06/11/2026 (Netvasco). Hospedagem planejada: GitHub Pages.

## Arquitetura do JS (módulos no mesmo arquivo)
`U` utilidades/escape · `Hash` senhas · `Store` persistência · `UI` modais/toasts · `Profile`/`Score` pontuação ·
`Auth` · `Chart` SVG · `Matches` · `Shell`/`Router` (hash `#/rota/param`) · `Pages.*` telas ·
`Encyclopedia` · `Compare` · `Feeds` RSS · `Daily` · `GameKit`/`Games.*` (player, match, year, career, quiz,
lineup, complete, together) · `FORMATIONS` · `MARKET`/`Manager` (modo gestor) · `SCHEMA`/`Admin` (CRUD genérico
orientado a esquema) · `Skin`/`SKINS` · `Countdown` · boot. Banco inicial em `SEED`.

## Regras de conteúdo (inegociáveis)
1. **Nunca inventar** placar, data, escalação, número de camisa, gols, classificação ou notícia.
   Sem confirmação → marcar `status: 'pendente'` e exibir "não disponível".
2. Todo registro histórico tem `source`, `url` (quando houver) e `status`: `confirmado` | `parcial` | `pendente`.
   Confirmado = fonte primária (ex.: súmula Netvasco) ou 2 fontes independentes.
3. Títulos oficiais, de reconhecimento debatido e amistosos ficam sempre separados (`official`).
4. Notícias: só título próprio, resumo próprio, fonte, data e link. Nunca copiar matéria nem imagem sem autorização.
5. Fotos de jogadores: só com licença (ex.: Wikimedia Commons) e crédito. Não reproduzir o escudo oficial
   (usamos uma cruz pátea genérica). Não usar escudos oficiais de outros clubes.
6. Valores, salários e atributos do modo gestor são "avaliações recreativas" e devem ser rotulados assim.

## Regras de segurança (AppSec)
- Todo dado dinâmico passa por `U.esc()`; URLs por `U.safeUrl()`/`U.safeImg()`; YouTube por `U.ytId()`.
- Nunca usar `innerHTML` com dado não escapado. Nunca `eval`/`new Function` com dado externo.
- Pontuação só via `Score.award(round, …)` com objeto `round` (impede duplicidade).
- Nenhum segredo no repositório. A chave **anon/publishable** do Supabase pode ficar no código;
  a **service_role/secret** e a senha do banco NUNCA (usar Secrets do Supabase/GitHub).
- Ao migrar para Supabase: RLS em todas as tabelas (leitura pública do conteúdo, escrita só `admin`,
  perfil só do dono), Supabase Auth com e-mail e MFA opcional, e remover o login local.
- LGPD: coleta mínima (sem CPF/endereço/telefone), idade mínima 13, exportar e excluir conta.
- Referências: OWASP Top 10, OWASP API Top 10, CWE, LGPD.

## Próximos passos (roadmap combinado)
1. ~~Publicar no GitHub Pages~~ (feito).
2. Supabase: ~~tabelas + RLS, Auth, conteúdo e perfil~~ (feito na v1.2). Falta: SMTP próprio para e-mails
   de confirmação (o SMTP padrão do Supabase só envia para a equipe do projeto), ligar `manager_teams`,
   ranking global opt-in (exige pontuação validada no servidor) e MFA opcional na tela de perfil.
3. Robô de notícias: Supabase Edge Function lendo RSS (Netvasco `https://www.netvasco.com.br/news/rss.xml`,
   Google Notícias "Vasco", YouTube de fontes jornalísticas) a cada 10 min via Supabase Cron; grava só
   título/fonte/data/link, deduplica por URL; allowlist de domínios, timeout e limite de tamanho.
4. GitHub Action a cada 3 dias acessando o Supabase para evitar pausa do plano grátis.
5. Atualizar a década 2020–2026 (elencos, técnicos, campanhas, jogos) com fonte e status.
6. Quando crescer: separar `index.html` em arquivos (`css/`, `js/`), CSP com nonce, headers HTTP de segurança.

## Como testar
`npm install` e depois `npm test` (jsdom: navegação, cadastro, os 8 jogos, gestor, admin, XSS, persistência,
4 visuais; `tests/cloud.js` simula o Supabase e as regras RLS, sem acessar a internet).
No Windows do dono o Node fica fora do PATH desta sessão: use `npm.cmd` após recarregar o PATH da máquina. Rode os testes depois de qualquer mudança e corrija falhas antes de concluir.
