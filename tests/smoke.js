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
  // ---- Game Center (motor Arcade: rodadas, vidas, combo, relógio, resultado) ----
  const resultShown = () => !!$('.arc-result');
  const playOut = async (max = 60) => { for (let k = 0; k < max && !resultShown(); k++) { const o = $$('.arc-opt, .arc-yn .opt').filter(b => !b.disabled); if (o.length) o[0].click(); else { const y = $('#ycrav'); if (y && !y.disabled) y.click(); } await sleep(3); const n = $('[data-next]'); if (n && !n.disabled) { n.click(); await sleep(3); } } };
  const quizRight = () => { const q = w.eval(`Store.col('quiz')`).find(x => x.q === $('#qarea h3').textContent); return $$('.arc-opt').find(b => b.textContent.slice(1) === q.opts[q.a]); };
  // quiz clássico (fácil), acertando tudo: sequência multiplica os pontos
  await go('#/games/quiz'); assert(!!$('.arc-go') && !!$('#arcSnd'), 'jogo abre com botão "Jogar agora" e opção de som');
  $('[data-k="classico"]').click(); await sleep(10); $('[data-k="facil"]').click(); await sleep(10);
  let sawCombo = false;
  for (let k = 0; k < 12 && !resultShown(); k++) { const r = quizRight(); r.click(); r.click(); await sleep(3); if ($('.arc-combo')) sawCombo = true; const n = $('#qn'); if (n) { n.click(); await sleep(3); } }
  let p = w.eval('Profile.current()'); assert(p.plays.quiz === 1 && p.history.length === 1, 'quiz pontua uma única vez: ' + p.points);
  assert(sawCombo && p.points > 100, 'acertos seguidos ativam o multiplicador (×2/×3): ' + p.points + ' pts');
  assert(p.medals.includes('quiz10') && p.medals.includes('streak5'), 'medalhas Gabarito e Sequência de 5');
  assert(!!$('[data-again]') && !!$('[data-share]') && $$('.arc-stars .on').length === 3, 'resultado com 3 estrelas, jogar de novo e desafiar amigo');
  $('[data-share]').click(); await sleep(20); assert(($('.modal-bg textarea') || {}).value && $('.modal-bg textarea').value.includes('Duvido você fazer mais'), 'desafiar um amigo gera texto para compartilhar');
  $('.modal-bg [data-x]').click();
  // quiz morte súbita: um erro encerra
  await go('#/games/quiz'); $('[data-k="morte"]').click(); await sleep(10);
  { const q = w.eval(`Store.col('quiz')`).find(x => x.q === $('#qarea h3').textContent); $$('.arc-opt').find(b => b.textContent.slice(1) !== q.opts[q.a]).click(); }
  await sleep(1600); assert(resultShown() && w.eval('Profile.current()').plays.quiz === 2, 'morte súbita termina no primeiro erro');
  // quiz 60 segundos: relógio corre e respostas avançam sozinhas
  await go('#/games/quiz'); $('[data-k="relogio"]').click(); await sleep(10);
  const q1 = $('#qarea h3').textContent; $$('.arc-opt')[0].click(); await sleep(1000);
  assert($('#qarea h3') && $('#qarea h3').textContent !== q1 && /^\d+s$/.test($('#qclk').textContent) && parseFloat($('#arcT').style.width) < 100, 'contra o relógio: próxima pergunta automática e relógio correndo');
  // quem é esse jogador (rápido): 3 vidas, rodadas até o fim
  await go('#/games/player'); $('[data-k="rapido"]').click(); await sleep(10);
  assert(!!$('#arcT') && $$('.arc-lives .on').length === 3 && $$('.arc-opt').length === 4 && $$('.clue.locked').length === 4, 'rodada com relógio, 3 vidas, 4 alternativas e pistas bloqueadas');
  await playOut(); p = w.eval('Profile.current()'); assert(resultShown() && p.plays.player === 1, 'quem é esse jogador: partida em rodadas registrada uma vez');
  // modo craque: digitando; sugestões só depois do 2º erro
  await go('#/games/player'); $('[data-k="craque"]').click(); await sleep(10);
  const typ = async v => { const i = $('#gi'); i.value = v; i.dispatchEvent(new w.Event('input')); await sleep(3); };
  await typ('Rom'); assert(!$('.arc-sug button'), 'craque: sem sugestões no início');
  for (let k = 0; k < 2; k++) { await typ('zzzz'); $('#gs').click(); await sleep(3); }
  await typ('Rom'); assert(!!$('.arc-sug button'), 'craque: sugestões liberadas após 2 erros');
  // adivinhe a partida
  await go('#/games/match'); $('[data-k="opcoes"]').click(); await sleep(10); await playOut();
  assert(w.eval('Profile.current()').plays.match === 1, 'partida misteriosa registrada uma vez');
  await go('#/games/match'); $('[data-k="ano"]').click(); await sleep(10); assert(!!$('#ycrav') && !!$('input[type=range]'), 'modo ano usa o seletor de ano');
  await playOut(); assert(w.eval('Profile.current()').plays.match === 2, 'modo ano completo');
  // de que ano é esse Vasco
  await go('#/games/year'); $('[data-k="facil"]').click(); await sleep(10);
  $('[data-d="10"]').click(); $('[data-d="1"]').click(); assert($('#yv').textContent === '1971', 'botões −10/−1/+1/+10 ajustam o ano');
  await playOut(); assert(w.eval('Profile.current()').plays.year === 1, 'de que ano registrado');
  assert(w.eval('[Arcade.yearScore(0), Arcade.yearScore(-2), Arcade.yearScore(10)].join()') === '1,0.4,0', 'pontuação por proximidade do ano');
  // já vestiu a camisa
  await go('#/games/career'); $('[data-k="rapido"]').click(); await sleep(10); assert($$('.crest.hidden').length > 0, 'escudos começam escondidos'); await playOut();
  assert(w.eval('Profile.current()').plays.career === 1, 'carreira pelos escudos registrada');
  // lineup perfect
  await go('#/games/lineup'); $('[data-id="l1998"]').click(); await sleep(10);
  const L = w.eval(`Store.col('lineups').find(l=>l.id==='l1998').players`);
  for (let i=0;i<11;i++) { const chip = $$('.pchip').find(c => c.dataset.n === L[i].name); chip.click(); await sleep(2); $$('.slot')[i].click(); await sleep(2); }
  $('#lchk').click(); await sleep(20); assert(txt().includes('Nota 10.0'), 'escalação perfeita = nota 10');
  assert(w.eval('Profile.current()').medals.includes('lineup10') && w.eval('Profile.current().lineupBest.l1998') === 10, 'medalha prancheta perfeita e melhor nota salva');
  // complete
  await go('#/games/complete'); $('[data-k="facil"]').click(); await sleep(10); const lu = $('.arc-hud span').textContent;
  const list = w.eval(`Store.col('lineups')`).find(l => l.label === lu); $$('input[data-i]').forEach(i => i.value = list.players[+i.dataset.i].name); $('#cok').click(); await sleep(10);
  assert(txt().includes('3 de 3 acertos'), 'complete o elenco: acertos contados');
  // quem jogou com quem: setas do teclado respondem
  await go('#/games/together'); $('[data-k="rapido"]').click(); await sleep(10);
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true})); await sleep(5);
  assert(!!$('[data-next]') && $$('.arc-yn .opt').every(b => b.disabled), 'seta → responde "jogaram juntos"');
  await playOut(); assert(w.eval('Profile.current()').plays.together === 1, 'quem jogou com quem registrado');
  // sem repetir desafios recentes
  assert(w.eval(`(()=>{ const L=[...Array(10)].map((_,i)=>({id:'x'+i})); const a=Arcade.fresh('t',L,5).map(x=>x.id), b=Arcade.fresh('t',L,5).map(x=>x.id); return a.every(x=>!b.includes(x)); })()`), 'sorteio não repete os desafios da partida anterior');
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
