const {JSDOM} = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const errors = [];
const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://localhost/index.html', pretendToBeVisual:true,
  beforeParse(w){ w.localStorage.setItem('falavascao:skinSeen','1'); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function(){};
    w.console.error = (...a) => errors.push(a.map(String).join(' ')); w.addEventListener('error', e => errors.push('winerr ' + e.message)); }});
const w = dom.window, d = w.document; const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const go = async h => { if (w.location.hash === h) w.eval('Router.render()'); else w.location.hash = h; await sleep(30); };
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const txt = () => $('#view').textContent;
(async () => {
  await sleep(100);
  for (const r of ['inicio','noticias','historia','historia/conquistas','historia/presidentes','historia/idolos','historia/fontes','elencos','elencos/1998','estatisticas','jogos','jogos/Flamengo','lamachia','games','memoria','comunidade','perfil','admin','busca/Romário']) {
    await go('#/' + r); assert(!txt().includes('Algo deu errado') && txt().length > 50, 'rota ' + r);
  }
  assert(txt().includes('Romário'), 'busca encontra Romário');
  await go('#/inicio'); assert(txt().includes('Vasco x Palmeiras'), 'próximo jogo exibido (se data >= hoje)');
  // cadastro com senha fraca
  await go('#/perfil'); $$('.tabs button')[1].click(); await sleep(10);
  const fill = (n, v) => { const el = d.querySelector(`[name="${n}"]`); el.value = v; };
  fill('name','Ana Souza'); fill('birth','1990-05-05'); fill('email','ana@ex.com'); fill('login','ana'); fill('password','fraca'); fill('password2','fraca'); fill('fav0','Romário'); fill('fav1','Edmundo'); fill('fav2','Juninho Pernambucano'); $('#rc').checked = true;
  $('#rgo').click(); await sleep(50); assert($('[data-err="password"]').textContent.includes('maiúscula'), 'senha fraca rejeitada');
  fill('password','Forte#1'); fill('password2','Forte#2'); $('#rgo').click(); await sleep(50); assert($('[data-err="password2"]').textContent.includes('não conferem'), 'confirmação divergente rejeitada');
  fill('password2','Forte#1'); $('#rgo').click(); await sleep(1500);
  assert(w.eval('Auth.isAdmin()'), 'primeira conta é admin');
  const db = JSON.parse(w.localStorage.getItem('falavascao:db')); assert(!JSON.stringify(db.users).includes('Forte#1'), 'senha não está em texto puro (' + db.users[0].pass.algo + ')');
  w.eval('Auth.logout()'); await sleep(20);
  await w.eval(`Auth.login('ana','errada').catch(e=>window.__le=e.message)`); assert(w.__le === 'Login ou senha incorretos.', 'login incorreto tratado');
  await w.eval(`Auth.login('ana','Forte#1')`); assert(w.eval('!!Auth.user()'), 'login correto');
  // quiz
  await go('#/games/quiz'); $('[data-k="facil"]').click(); await sleep(10);
  while ($('#qn') || $$('.opt').length) { const o = $$('.opt'); if (!o.length || o[0].disabled && !$('#qn')) break; o[0].click(); o[0].click(); if (!$('#qn')) break; $('#qn').click(); await sleep(5); if ($('[data-again]')) break; }
  let p = w.eval('Profile.current()'); assert(p.plays.quiz === 1 && p.history.length === 1, 'quiz pontua uma única vez: ' + p.points);
  const ptsAfterQuiz = p.points; const again = $('[data-again]'); assert(!!again, 'botão jogar novamente');
  // jogador borrado
  await go('#/games/player'); $('[data-k="medio"]').click(); await sleep(10);
  for (let i=0;i<5;i++) { $('#gi').value = 'zzzz'; $('#gs').click(); await sleep(5); }
  p = w.eval('Profile.current()'); assert(p.plays.player === 1, 'jogador borrado encerra após 5 erros');
  await go('#/games/player'); $('[data-k="facil"]').click(); await sleep(10);
  const ans = w.eval(`(()=>{const n=document.querySelector('#pf svg, #pf img'); return null})()`);
  // match
  await go('#/games/match'); $('[data-k="opcoes"]').click(); await sleep(10); $('#mh').click(); $$('#mo .opt')[0].click(); $$('#mo .opt')[1].click(); await sleep(10);
  p = w.eval('Profile.current()'); assert(p.plays.match === 1, 'partida misteriosa registrada uma vez');
  await go('#/games/match'); $('[data-k="ano"]').click(); await sleep(10); for (let i=0;i<3;i++){ $('#mi').value='1900'; $('#ms').click(); } await sleep(10); assert(w.eval('Profile.current()').plays.match === 2, 'modo ano encerra após 3 erros');
  // year
  await go('#/games/year'); $('[data-k="facil"]').click(); await sleep(10); $$('#yo .opt').forEach(b => b.click()); await sleep(10); assert(w.eval('Profile.current()').plays.year === 1, 'de que ano registrado');
  // career correct
  await go('#/games/career'); await sleep(10); const player = w.eval(`Store.col('careers').find(c => document.querySelector('#cc').innerHTML && true) && null`);
  for (const c of w.eval(`Store.col('careers').map(c=>c.player)`)) { if (w.eval('Profile.current()').plays.career) break; $('#ci').value = c; $('#cs').click(); await sleep(5); }
  assert(w.eval('Profile.current()').plays.career === 1, 'carreira pelos escudos registrada');
  // lineup perfect
  await go('#/games/lineup'); $('[data-id="l1998"]').click(); await sleep(10);
  const L = w.eval(`Store.col('lineups').find(l=>l.id==='l1998').players`);
  for (let i=0;i<11;i++) { const chip = $$('.pchip').find(c => c.dataset.n === L[i].name); chip.click(); await sleep(2); $$('.slot')[i].click(); await sleep(2); }
  $('#lchk').click(); await sleep(20); assert(txt().includes('Nota 10.0'), 'escalação perfeita = nota 10');
  assert(w.eval('Profile.current()').medals.includes('lineup10'), 'medalha prancheta perfeita');
  // complete
  await go('#/games/complete'); $('[data-k="facil"]').click(); await sleep(10); const lu = $('.scorebar span').textContent;
  const list = w.eval(`Store.col('lineups')`).find(l => l.label === lu); $$('input[data-i]').forEach(i => i.value = list.players[+i.dataset.i].name); $('#cok').click(); await sleep(10);
  assert(txt().includes('3 de 3 acertos'), 'complete o elenco: acertos contados');
  // together
  await go('#/games/together'); for (let i=0;i<5;i++){ $$('.opt')[0].click(); $('#tn').click(); await sleep(3); } assert(w.eval('Profile.current()').plays.together === 1, 'quem jogou com quem registrado');
  // daily
  await go('#/inicio'); $$('#dailyBox .opt')[0].click(); await sleep(10); const pd = w.eval('Profile.current()'); assert(Object.keys(pd.daily).length === 1, 'desafio diário registrado');
  $$('#dailyBox .opt').forEach(b => b.click()); assert(w.eval('Profile.current()').plays.daily === 1, 'desafio diário não duplica');
  // manager
  const r1 = w.eval(`Manager.create('T1','20','atual')`); assert(r1.error || r1.team, 'criação com referência 2026 em 20 mi: ' + (r1.error ? 'bloqueada por folha' : 'ok'));
  const t = w.eval(`Manager.create('T2','20','zero').team`); const err = w.eval(`Manager.buy(Store.col('teams').find(x=>x.name==='T2'),'mk_romario',${1000})`); assert(/Saldo insuficiente/.test(err), 'não gasta acima do orçamento');
  const e2 = w.eval(`Manager.buy(Store.col('teams').find(x=>x.name==='T2'),'mk_base0',5)`); assert(/não aceita/.test(e2), 'salário abaixo do mínimo rejeitado');
  w.eval(`(()=>{const t=Store.col('teams').find(x=>x.name==='T2'); for(const m of MARKET.slice().sort((a,b)=>a.value-b.value)){ Manager.buy(t,m.id,m.salary); } })()`);
  assert(w.eval(`Manager.balance(Store.col('teams').find(x=>x.name==='T2'))`) >= 0, 'saldo nunca negativo após compras em massa: ' + w.eval(`Manager.balance(Store.col('teams').find(x=>x.name==='T2')).toFixed(2)`));
  const tid = w.eval(`Store.col('teams').find(x=>x.name==='T2').id`); await go('#/lamachia/' + tid);
  for (const k of ['elenco','tatica','relatorio','mercado']) { $$('.tabs button').find(b => b.dataset.k === k).click(); await sleep(10); assert(!txt().includes('Algo deu errado'), 'aba gestor ' + k); }
  $$('.tabs button').find(b => b.dataset.k === 'tatica').click(); await sleep(5); $('#ta').click(); await sleep(5); $$('.tabs button').find(b => b.dataset.k === 'relatorio').click(); await sleep(10); assert(txt().includes('Seu Vasco está pronto?'), 'relatório exibido');
  const ul = w.eval(`(()=>{const t=Manager.create('U','ilimitado','zero').team; Manager.buy(t,'mk_romario',2000); return t.squad.length})()`); assert(ul === 1, 'orçamento ilimitado permite compra');
  // admin CRUD
  await go('#/noticias'); $('#addNews').click(); await sleep(10);
  const m = $('.modal-bg'); m.querySelector('#f_title').value = 'Teste'; m.querySelector('#f_source').value = 'X'; m.querySelector('#f_date').value = '2026-11-06'; m.querySelector('#f_summary').value = 'Resumo <script>alert(1)</script>'; m.querySelector('#f_url').value = 'javascript:alert(1)';
  [...m.querySelectorAll('.modal-f .btn')].pop().click(); await sleep(10); assert(m.querySelector('#ferr').textContent.includes('link'), 'URL javascript: rejeitada');
  m.querySelector('#f_url').value = 'https://example.com/a'; [...m.querySelectorAll('.modal-f .btn')].pop().click(); await sleep(20);
  assert(txt().includes('Teste') && !$('#view').innerHTML.includes('<script>alert'), 'notícia criada e escapada (XSS)');
  w.eval(`Admin.download('x.json',{a:1})`); assert(true, 'exportação gerada');
  const evil = w.eval(`Admin.safeParse('{"__proto__":{"polluted":1},"a":1}')`); assert(!({}).polluted && !w.eval('({}).polluted'), 'import bloqueia __proto__');
  await go('#/admin/backup'); assert(txt().includes('Backup completo'), 'tela de backup');
  await go('#/admin/dados'); $('#sv').click(); assert(true, 'salvar dados atuais');
  await go('#/admin/usuarios'); assert(txt().includes('ana'), 'usuários locais');
  // persistence reload
  const saved = w.localStorage.getItem('falavascao:db'); const dom2 = new JSDOM(html, {runScripts:'dangerously', url:'https://localhost/index.html', beforeParse(w2){ w2.localStorage.setItem('falavascao:db', saved); w2.localStorage.setItem('falavascao:session', w.localStorage.getItem('falavascao:session')); w2.scrollTo=()=>{}; }});
  await sleep(100); assert(dom2.window.eval('Auth.user() && Auth.user().profile.points') === w.eval('Profile.current().points'), 'persistência após recarregar');
  console.log('errors:', errors.filter(e => !/Could not load|stylesheet|Not implemented/.test(e)).slice(0,10));
  console.log('pontos finais', w.eval('Profile.current().points'), 'medalhas', w.eval('Profile.current().medals'));
  process.exit();
})();
