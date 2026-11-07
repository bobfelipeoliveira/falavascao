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
- **Identidade v2 (rebranding em andamento)**: guia da marca em `marca/index.html` (logo, paleta, tipografia,
  3 direções A/B/C). Símbolo = balão de fala + faixa diagonal + cruz pátea pequena (nunca o escudo oficial);
  no site é o `<symbol id="fv-sym">` com cores por variáveis `--lb/--ls/--lc`. Paleta: #090909/#121212/#1B1B1B/
  #303030/#B8B8B8/#F5F5F5 e vermelho #C8102E só em detalhes (≈2% da tela). Modo noite (padrão) = camisa 1,
  modo dia = camisa 2. Módulo `Theme` + botão sol/lua (`#themeBtn`), preferência em `falavascao:theme`.
  **Direção escolhida: A · Vasco Clássico** (padrão), aplicada pela camada CSS "IDENTIDADE v2 · DIREÇÃO A".
  Regras visuais: `.kicker` cinza em caixa alta; `h2.sec` com linha fina + marcador vermelho; `.btn.red` =
  ação principal em preto/branco invertido; vermelho de verdade só em `.btn.red.danger` (UI.confirm danger),
  contagem regressiva, item selecionado do menu, marca e alertas. Visuais opcionais: B (`app`), C (`editorial`)
  e Videogame (`game`), todos sem neon/gradiente vermelho. Imagem de compartilhamento: `marca/compartilhamento.png`.
  Ponto de restauração: tag git `v1.2-antes-da-nova-marca`.
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
2. Supabase: ~~tabelas + RLS, Auth, conteúdo e perfil~~ (feito na v1.2). ~~SMTP próprio~~ (feito: Gmail
   `falavascao.site@gmail.com` com senha de app, configurado só no painel do Supabase; modelos em português em
   `supabase/emails/`, testado com cadastro real em 07/11/2026). Falta: ligar `manager_teams`,
   ranking global opt-in (exige pontuação validada no servidor) e MFA opcional na tela de perfil.
3. **Robô de notícias "Giro da Colina"** (código pronto, v1.3): Edge Function `supabase/functions/giro-da-colina/index.ts`
   (sem dependências; funções puras exportadas e testadas em `tests/giro.mjs`), tabelas/RLS/fontes iniciais em
   `supabase/giro-da-colina.sql`, agendamento Supabase Cron a cada 15 min. Guarda só título da fonte, veículo,
   horário e link (nunca texto/imagem da matéria). Fontes com feed próprio: NetVasco, ge, SuperVasco, Papo na Colina;
   sem feed (LANCE!, ESPN): busca do Google Notícias "Vasco site:domínio". Site oficial e Atenção Vascaínos
   não têm feed utilizável (verificado em 07/11/2026). Categoria e confirmação são heurísticas por palavras-chave
   (admin corrige → `manual=true`). Visitantes disparam no máx. 1 busca/5 min; admin força. Função com
   "Verify JWT" desligado (faz a própria checagem de admin). No site: módulo `Giro`, aba em Notícias,
   destaques na Início e aba "Giro da Colina" no painel. Resumo por IA: opcional, ainda não implementado.
4. GitHub Action a cada 3 dias acessando o Supabase para evitar pausa do plano grátis.
5. Atualizar a década 2020–2026 (elencos, técnicos, campanhas, jogos) com fonte e status.
6. Quando crescer: separar `index.html` em arquivos (`css/`, `js/`), CSP com nonce, headers HTTP de segurança.

## Como testar
`npm install` e depois `npm test` (jsdom: navegação, cadastro, os 8 jogos, gestor, admin, XSS, persistência,
4 visuais; `tests/cloud.js` simula o Supabase e as regras RLS, sem acessar a internet).
No Windows do dono o Node fica fora do PATH desta sessão: use `npm.cmd` após recarregar o PATH da máquina. Rode os testes depois de qualquer mudança e corrija falhas antes de concluir.
