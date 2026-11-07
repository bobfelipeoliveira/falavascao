# FALA, VASCÃO! — A casa digital do vascaíno (v1.0)

## Como abrir
1. Baixe `index.html` e abra com dois cliques (Chrome, Edge, Firefox ou Safari). Não precisa de instalação, servidor nem internet — só as fontes tipográficas e os links externos usam conexão.
2. No celular, abra o arquivo pelo navegador (ou hospede em qualquer serviço estático, como GitHub Pages ou Netlify, para usar pelo endereço).
3. Crie uma conta em **Meu perfil**. A **primeira conta criada** no navegador vira **administrador local** e ganha o menu **Painel administrativo**.

## O que funciona localmente (sem servidor)
| Área | Situação |
|---|---|
| Início, Notícias, História, Elencos, Estatísticas, Jogos, Memória | Funcionais, com filtros, busca e modais |
| Game Center (8 jogos) | Regras, pontuação, recordes, proteção contra pontuação duplicada |
| Seja o Lamachia | Orçamentos, mercado, salários, venda, campo tático, gestões salvas e relatório |
| Perfil, níveis, medalhas, ranking local, desafio diário | Persistidos no navegador |
| Cadastro, login, logout, recuperação e edição | **Demonstrativos** (ver segurança) |
| Painel administrativo | CRUD de 13 coleções, dados atuais, usuários, importação, exportação, backup |

## Backup
- **Painel › Backup e importação › Backup completo (JSON)**: baixa tudo (conteúdo, contas com hash de senha, pontuações, gestões).
- **Somente conteúdo**: baixa o conteúdo editorial, sem contas — ideal para compartilhar a base.
- **Importar**: *Mesclar* atualiza por ID; *Restaurar backup completo* substitui tudo (pede confirmação).
- Limpar os dados do navegador apaga tudo. Faça backup antes e com frequência. Limite típico do navegador: ~5 MB (fotos enviadas são reduzidas para 600 px).

## Dados e fontes
- Snapshot atual de **06/11/2026** (Netvasco): próximo jogo, último resultado, 13º lugar após a 34ª rodada, números da temporada e 12 notícias com resumo próprio e link.
- Cada registro histórico tem fonte e grau: **Confirmado**, **Parcialmente confirmado** ou **Pendente de verificação**. Lacunas não foram preenchidas com dados inventados.
- Atributos, valores e salários do modo gestor são **avaliações recreativas**; “Promessa da base” são atletas **fictícios**.
- Escudos dos clubes são estilizados (iniciais), e a Cruz usada é um símbolo heráldico genérico — o escudo oficial não é reproduzido.
- O jogo “Quem é esse jogador?” usa silhuetas até que o administrador cadastre fotos com licença.

## Limitações conhecidas
- Notícias não se atualizam sozinhas: feeds RSS costumam ser bloqueados por CORS no navegador (a tela informa quando isso acontece).
- Retrospectos e estatísticas de partidas são calculados **somente** sobre os jogos cadastrados.
- A lista de presidentes e vários elencos históricos ainda estão incompletos (marcados como pendentes).
- Contas e ranking existem apenas no navegador onde foram criados.

## Segurança (estado atual)
Controles implementados: CSP restritiva via meta tag; escape de todo conteúdo dinâmico (anti-XSS); validação de URLs (só http/https) e IDs do YouTube; iframe sandbox com youtube-nocookie; senhas com PBKDF2-SHA256 (150 mil iterações, sal aleatório) e fallback SHA-256 iterado; comparação em tempo constante; bloqueio de 30 s após 5 falhas; importação com limite de tamanho e bloqueio de `__proto__`; coleta mínima de dados (LGPD) com idade mínima de 13 anos, exportação e exclusão da própria conta.

Riscos residuais (aceitáveis só em demonstração):
- **Autenticação no cliente** (CWE-603, OWASP A07:2021): qualquer pessoa com acesso ao navegador pode editar o localStorage e virar admin. Não publique o admin assim.
- **Dados sem criptografia em repouso** (CWE-312): e-mail e data de nascimento ficam no localStorage.
- **Recuperação de conta por dados pessoais** (CWE-640): substituir por link com token de uso único enviado por e-mail.
- `script-src 'unsafe-inline'` é necessário no arquivo único; na versão online, mover o JS para arquivo externo e usar nonce/hash.

## Roadmap de integração online
1. **Supabase Auth** (e-mail + MFA opcional) substituindo `Auth` e `Hash`.
2. **PostgreSQL** com as mesmas coleções do `Store` e **RLS**: leitura pública do conteúdo; escrita só para papel `admin`; perfis só pelo dono.
3. **Storage** para fotos licenciadas, com metadados de crédito e licença obrigatórios.
4. Função de servidor para ler RSS (resolve CORS) com cache e lista de domínios permitidos.
5. API de futebol licenciada para calendário e classificação.
6. Ranking global e perfis públicos (opt-in), assinaturas e área premium.
7. Pipeline: SAST (Semgrep), SCA, secret scanning, DAST (OWASP ZAP) e headers HTTP de segurança (CSP com nonce, HSTS, frame-ancestors).
8. Motor de simulação: `Manager.strength()` e os atributos já estão prontos para `Engine.simulate()`.
