// Testa o modo online (Supabase) com um servidor FALSO em memória que imita a API do Supabase
// e as regras RLS de supabase/schema.sql. Nenhuma chamada real à internet é feita.
const {JSDOM} = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

/* ---------------- servidor Supabase simulado ---------------- */
const S = { users:{}, profiles:{}, content:[], settings:[], admins:new Set(), confirm:true, calls:[], seq:0 };
const tok = id => `h.${id}.s`, idOf = h => { const m = /^Bearer h\.([\w-]+)\.s$/.exec(h || ''); return m && Object.values(S.users).some(u => u.id === m[1]) ? m[1] : null; };
const reply = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => body === undefined ? '' : JSON.stringify(body) });
const deny = () => reply(401, {code:'42501', message:'permission denied'});
const session = u => ({access_token:tok(u.id), refresh_token:'rt_' + u.id + '_refresh', expires_in:3600, user:{id:u.id, email:u.email}});
const qs = url => new URL(url).searchParams;
function fetchMock(url, opts = {}) {
  const u = new URL(url), path = u.pathname, method = opts.method || 'GET', body = opts.body ? JSON.parse(opts.body) : undefined;
  const h = opts.headers || {}, me = idOf(h.Authorization); S.calls.push(method + ' ' + path);
  if (h.apikey !== 'sb_publishable_RiPi4b86637qfUE5WO-s2w__d-Cc8yl') return reply(401, {message:'bad key'});
  const isAdmin = me && S.admins.has(me);
  // ---- Auth ----
  if (path === '/auth/v1/signup') { if (S.users[body.email]) return reply(200, {id:'fake'}); const usr = {id:'u' + (++S.seq), email:body.email, password:body.password, meta:body.data || {}, confirmed:!S.confirm}; S.users[body.email] = usr; return reply(200, S.confirm ? {id:usr.id, email:usr.email} : session(usr)); }
  if (path === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') { const usr = S.users[body.email]; if (!usr || usr.password !== body.password) return reply(400, {error_code:'invalid_credentials'}); if (!usr.confirmed) return reply(400, {error_code:'email_not_confirmed'}); return reply(200, session(usr)); }
  if (path === '/auth/v1/token') { const usr = Object.values(S.users).find(x => 'rt_' + x.id + '_refresh' === body.refresh_token); return usr ? reply(200, session(usr)) : reply(400, {error_code:'refresh_token_not_found'}); }
  if (path === '/auth/v1/user' && method === 'GET') { const usr = Object.values(S.users).find(x => x.id === me); return usr ? reply(200, {id:usr.id, email:usr.email, user_metadata:usr.meta}) : reply(401, {}); }
  if (path === '/auth/v1/user' && method === 'PUT') { const usr = Object.values(S.users).find(x => x.id === me); if (!usr) return reply(401, {}); usr.password = body.password; return reply(200, {id:usr.id}); }
  if (path === '/auth/v1/logout') return reply(204);
  if (path === '/auth/v1/recover') { S.recoverFor = body.email; return reply(200, {}); }
  // ---- REST (com as regras RLS do schema.sql) ----
  if (path === '/rest/v1/content' && method === 'GET') { const off = +(u.searchParams.get('offset') || 0), lim = +(u.searchParams.get('limit') || 1000); return reply(200, S.content.slice(off, off + lim).map(r => JSON.parse(JSON.stringify(r)))); }
  if (path === '/rest/v1/content' && method === 'POST') { if (!isAdmin) return deny(); body.forEach(r => { const i = S.content.findIndex(x => x.collection === r.collection && x.id === r.id); i >= 0 ? S.content[i] = r : S.content.push(r); }); return reply(201); }
  if (path === '/rest/v1/content' && method === 'DELETE') { if (!isAdmin) return reply(200, []); const c = u.searchParams.get('collection').slice(3), id = u.searchParams.get('id').slice(3); const gone = S.content.filter(x => x.collection === c && x.id === id); S.content = S.content.filter(x => !(x.collection === c && x.id === id)); return reply(200, gone); }
  if (path === '/rest/v1/site_settings' && method === 'GET') return reply(200, S.settings);
  if (path === '/rest/v1/site_settings' && method === 'POST') { if (!isAdmin) return deny(); body.forEach(r => { S.settings = S.settings.filter(x => x.key !== r.key).concat([r]); }); return reply(201); }
  if (path === '/rest/v1/admins') { if (!me) return deny(); return reply(200, S.admins.has(me) ? [{user_id:me}] : []); }
  if (path === '/rest/v1/profiles' && method === 'GET') { if (!me) return deny(); const f = u.searchParams.get('user_id'); if (f) { const id = f.slice(3); return reply(200, (id === me || isAdmin) && S.profiles[id] ? [S.profiles[id]] : []); } return reply(200, isAdmin ? Object.values(S.profiles).map(p => ({login:p.login, display_name:p.display_name, created_at:p.created_at, points:p.progress.points})) : Object.values(S.profiles).filter(p => p.user_id === me)); }
  if (path === '/rest/v1/profiles' && method === 'POST') { if (!me) return deny(); if (S.profiles[me]) return reply(409, {code:'23505'}); if (Object.values(S.profiles).some(p => p.login.toLowerCase() === body.login.toLowerCase())) return reply(409, {code:'23505'}); if (!/^[a-zA-Z0-9_.]{3,20}$/.test(body.login)) return reply(400, {code:'23514'}); const row = {user_id:me, login:body.login, display_name:body.display_name, progress:body.progress, created_at:new Date().toISOString()}; S.profiles[me] = row; return reply(201, [row]); }
  if (path === '/rest/v1/profiles' && method === 'PATCH') { const id = u.searchParams.get('user_id').slice(3); if (id !== me || !S.profiles[id]) return reply(204); Object.assign(S.profiles[id], body); return reply(204); }
  if (path === '/rest/v1/rpc/delete_my_account') { if (!me) return deny(); const email = Object.keys(S.users).find(k => S.users[k].id === me); delete S.users[email]; delete S.profiles[me]; S.admins.delete(me); return reply(204); }
  return reply(404, {message:'rota não simulada: ' + method + ' ' + path});
}

const errors = [];
function open(hash = '#/inicio', storage = {}) {
  const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://bob.github.io/falavascao/' + hash, pretendToBeVisual:true,
    beforeParse(w) { w.fetch = fetchMock; w.localStorage.setItem('falavascao:skinSeen', '1'); Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
      w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function(){};
      w.console.error = (...a) => errors.push(a.map(String).join(' ')); w.console.warn = () => {}; }});
  const w = dom.window, d = w.document;
  return {w, d, $:s => d.querySelector(s), $$:s => [...d.querySelectorAll(s)], txt:() => d.querySelector('#view').textContent,
    go: async h => { if (w.location.hash === h) w.eval('Router.render()'); else w.location.hash = h; await sleep(40); }};
}
const toasts = d => [...d.querySelectorAll('.toast')].map(t => t.textContent).join(' | ');

(async () => {
  // 1) Banco vazio: o site continua com o conteúdo local (SEED)
  let A = open(); await sleep(150);
  assert(A.w.eval('Cloud.on') === true, 'modo online ativado quando há fetch e configuração');
  assert(A.txt().includes('Vasco x Palmeiras'), 'banco vazio: conteúdo local continua aparecendo');
  await A.go('#/admin'); assert(A.txt().includes('Área restrita'), 'visitante não acessa o painel');

  // 2) Cadastro com confirmação de e-mail
  await A.go('#/perfil'); A.$$('.tabs button')[1].click(); await sleep(10);
  assert(!A.d.querySelector('[name="name"]'), 'cadastro online não pede nome completo (LGPD: coleta mínima)');
  const fill = (n, v) => { A.d.querySelector(`[name="${n}"]`).value = v; };
  fill('birth', '1990-05-05'); fill('email', 'Ana@Ex.com'); fill('login', 'ana'); fill('password', 'Forte#1'); fill('password2', 'Forte#1'); fill('fav0', 'Romário'); fill('fav1', 'Edmundo'); fill('fav2', 'Dinamite'); A.$('#rc').checked = true;
  A.$('#rgo').click(); await sleep(80);
  assert(A.txt().includes('Falta só confirmar o e-mail') && !!S.users['ana@ex.com'], 'cadastro cria conta no servidor e pede confirmação por e-mail');
  assert(!S.users['ana@ex.com'].meta.birth && !JSON.stringify(S.users['ana@ex.com'].meta).includes('1990'), 'data de nascimento NÃO é enviada ao servidor');
  await A.w.eval(`Auth.login('ana@ex.com','Forte#1').catch(e => window.__e = e.message)`); assert(/Confirme seu e-mail/.test(A.w.__e), 'login antes de confirmar o e-mail é bloqueado com mensagem clara');
  S.users['ana@ex.com'].confirmed = true;
  await A.w.eval(`Auth.login('ana@ex.com','errada').catch(e => window.__e2 = e.message)`); assert(A.w.__e2 === 'E-mail ou senha incorretos.', 'senha errada tratada');
  await A.w.eval(`Auth.login('ana@ex.com','Forte#1')`); await sleep(20);
  const anaId = S.users['ana@ex.com'].id;
  assert(A.w.eval('!!Auth.user() && Auth.user().cloud') && S.profiles[anaId] && S.profiles[anaId].login === 'ana', 'login correto cria o perfil no servidor');
  assert(JSON.stringify(S.profiles[anaId].progress.favPlayers) === '["Romário","Edmundo","Dinamite"]', 'favoritos do cadastro vão para o perfil');
  assert(A.w.eval('Auth.isAdmin()') === false, 'conta nova NÃO vira admin (fim do "primeira conta é admin")');
  assert(!A.w.localStorage.getItem('falavascao:session') && !!A.w.localStorage.getItem('falavascao:sb'), 'sessão local demonstrativa não é usada no modo online');
  await A.go('#/admin'); assert(A.txt().includes('Área restrita'), 'torcedor comum não acessa o painel');

  // 3) Pontuação sincronizada
  await A.go('#/inicio'); A.$$('#dailyBox .opt')[0].click(); await sleep(1500);
  assert(S.profiles[anaId].progress.plays.daily === 1, 'progresso do jogo é salvo no servidor');

  // 4) Tentativa de escrita sem ser admin é barrada pelo servidor (RLS)
  const denied = await A.w.eval(`Cloud.pushRow('news', {id:'hack', title:'x'}).then(() => 'gravou', e => e.message)`);
  assert(denied !== 'gravou' && !S.content.some(r => r.id === 'hack'), 'servidor recusa escrita de quem não é admin');

  // 5) Login repetido vira outro apelido
  S.confirm = false; const B = open('#/perfil'); await sleep(150);
  await B.w.eval(`Auth.register({name:'', birth:'1995-01-01', email:'bia@ex.com', login:'ana', password:'Forte#2', password2:'Forte#2', favs:['a','b','c'], consent:true})`); await sleep(20);
  const biaLogin = S.profiles[S.users['bia@ex.com'].id].login; assert(biaLogin !== 'ana' && biaLogin.startsWith('ana'), 'apelido repetido recebe sufixo: ' + biaLogin);

  // 6) Admin: definido só no servidor; publica conteúdo inicial e edita
  S.admins.add(anaId);
  const C = open('#/inicio', {'falavascao:sb':A.w.localStorage.getItem('falavascao:sb')}); await sleep(200);
  assert(C.w.eval('Auth.isAdmin()') === true, 'admin reconhecido pela tabela admins do servidor');
  await C.go('#/admin/backup'); assert(!!C.$('#pushAll'), 'botão "Enviar conteúdo para o banco online" aparece para o admin');
  const r = await C.w.eval('Cloud.pushAll(false)'); assert(r.sent > 50 && S.content.length === r.sent && S.settings.length === 2, 'conteúdo inicial enviado ao banco: ' + r.sent + ' registros');
  await C.go('#/noticias'); C.$('#addNews').click(); await sleep(10);
  const m = C.$('.modal-bg'); m.querySelector('#f_title').value = 'Manchete <img src=x onerror=alert(1)>'; m.querySelector('#f_source').value = 'Fonte'; m.querySelector('#f_date').value = '2026-11-07'; m.querySelector('#f_summary').value = 'Resumo próprio'; m.querySelector('#f_url').value = 'https://example.com/n';
  [...m.querySelectorAll('.modal-f .btn')].pop().click(); await sleep(60);
  const saved = S.content.find(x => x.collection === 'news' && String(x.data.title).startsWith('Manchete'));
  assert(!!saved, 'notícia criada pelo admin é gravada no banco online');
  // 7) Outro visitante vê a notícia (vinda do banco) e ela aparece escapada
  const D = open('#/noticias'); await sleep(200);
  assert(D.txt().includes('Manchete <img') && !D.$('#view').innerHTML.includes('<img src="x"') && !D.$('#view img[src="x"]'), 'visitante vê a notícia do banco, com HTML escapado (anti-XSS)');
  // 8) Excluir pelo admin remove do banco
  await C.w.eval(`Store.remove('news', ${JSON.stringify(saved.id)})`); await sleep(40);
  assert(!S.content.some(x => x.id === saved.id), 'exclusão do admin remove do banco');
  await C.go('#/admin/usuarios'); await sleep(40); assert(C.txt().includes('ana') && C.txt().includes(biaLogin) && !C.txt().includes('@ex.com'), 'admin vê a lista de usuários sem os e-mails');

  // 9) Link de recuperação de senha vindo por e-mail
  const E = open('#access_token=' + tok(anaId) + '&refresh_token=rt_' + anaId + '_refresh' + '&expires_in=3600&type=recovery'); await sleep(200);
  assert(E.w.location.hash === '#/perfil' && !E.w.location.href.includes('access_token'), 'tokens do link são removidos da barra de endereço');
  assert(E.d.body.textContent.includes('Criar nova senha'), 'link de recuperação abre a tela de nova senha');
  E.d.querySelector('#np1').value = 'NovaSenha#9'; E.d.querySelector('#np2').value = 'NovaSenha#9'; [...E.d.querySelectorAll('.modal-f .btn')].pop().click(); await sleep(40);
  assert(S.users['ana@ex.com'].password === 'NovaSenha#9', 'nova senha gravada no servidor');
  const F = open('#error=access_denied&error_code=otp_expired'); await sleep(150);
  assert(toasts(F.d).includes('inválido ou expirou') && F.w.location.hash === '#/perfil', 'link expirado mostra aviso');

  // 10) Excluir a própria conta (LGPD)
  const bId = S.users['bia@ex.com'].id; await B.w.eval(`Cloud.deleteAccount()`);
  assert(!S.profiles[bId] && !S.users['bia@ex.com'], 'usuário apaga a própria conta e o perfil no servidor');

  // 11) Sem internet: o site abre com a cópia guardada
  const off = () => Promise.reject(new TypeError('Failed to fetch'));
  const G = new JSDOM(html, {runScripts:'dangerously', url:'https://bob.github.io/falavascao/#/inicio', pretendToBeVisual:true, beforeParse(w){ w.fetch = off; w.scrollTo = () => {}; w.localStorage.setItem('falavascao:skinSeen','1'); w.console.error = (...a) => errors.push(a.join(' ')); w.console.warn = () => {}; }});
  await sleep(200); assert(G.window.document.querySelector('#view').textContent.includes('Vasco x Palmeiras'), 'sem internet: site abre normalmente com o conteúdo local');

  console.log('errors', errors.filter(e => !/Not implemented|Could not load/.test(e)).slice(0, 10));
  process.exit();
})();
