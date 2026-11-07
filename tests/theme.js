// Modo dia/noite: padrão noite, troca instantânea pelo botão sol/lua, preferência salva e respeitada ao reabrir.
const {JSDOM} = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const errors = [];
const open = (store = {}) => new JSDOM(html, {runScripts:'dangerously', url:'https://localhost/#/inicio', pretendToBeVisual:true,
  beforeParse(w){ w.localStorage.setItem('falavascao:skinSeen','1'); Object.entries(store).forEach(([k,v]) => w.localStorage.setItem(k, v)); w.scrollTo = () => {}; w.console.error = (...a) => errors.push(a.join(' ')); }});
(async () => {
  const A = open(); await sleep(150); const w = A.window, d = w.document, root = d.documentElement;
  assert(root.dataset.theme === 'dark', 'modo noite é o padrão');
  const btn = d.querySelector('#themeBtn');
  assert(!!btn && btn.querySelector('.sun') && btn.querySelector('.moon'), 'botão visível com sol e lua no topo');
  assert(btn.getAttribute('aria-label') === 'Mudar para o modo dia', 'botão tem descrição para leitores de tela');
  const viewBefore = d.querySelector('#view').innerHTML;
  btn.click(); await sleep(20);
  assert(root.dataset.theme === 'light' && w.localStorage.getItem('falavascao:theme') === 'light', 'clique troca para o modo dia e salva a escolha');
  assert(d.querySelector('#view').innerHTML === viewBefore, 'troca é instantânea, sem recarregar a tela');
  assert(d.querySelector('meta[name="theme-color"]').getAttribute('content') === '#F4F4F2', 'cor da barra do celular acompanha o tema');
  assert(btn.getAttribute('aria-pressed') === 'true' && btn.getAttribute('aria-label') === 'Mudar para o modo noite', 'estado do botão atualizado');
  const B = open({'falavascao:theme':'light'}); await sleep(150);
  assert(B.window.document.documentElement.dataset.theme === 'light', 'preferência mantida ao fechar e abrir o site');
  B.window.location.hash = '#/perfil'; await sleep(40);
  B.window.location.hash = '#/games'; await sleep(40);
  assert(B.window.document.documentElement.dataset.theme === 'light', 'tema continua igual ao navegar entre páginas');
  btn.click(); await sleep(20); assert(root.dataset.theme === 'dark' && w.localStorage.getItem('falavascao:theme') === 'dark', 'volta para o modo noite');
  assert(!!d.querySelector('.brand .fv-sym use') && !!d.querySelector('link[rel="icon"][href="marca/favicon.svg"]'), 'logo novo no menu e ícone da aba configurado');
  console.log('errors', errors.filter(e => !/Not implemented|Could not load/.test(e)));
  process.exit();
})();
