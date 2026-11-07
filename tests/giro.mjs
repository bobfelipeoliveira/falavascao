// Testa o robô Giro da Colina (supabase/functions/giro-da-colina/index.ts) sem internet:
// feeds e banco são simulados em memória. Roda o mesmo arquivo que vai para o Supabase.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const G = await import(pathToFileURL(path.join(import.meta.dirname, '..', 'supabase', 'functions', 'giro-da-colina', 'index.ts')).href);
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const NOW = Date.parse('2026-11-07T12:00:00Z'); const iso = h => new Date(NOW - h * 36e5).toUTCString();

/* ---------- leitura e limpeza ---------- */
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>NetVasco</title>
<item><title><![CDATA[Vasco &amp; Palmeiras: <b>escalações</b> confirmadas]]></title><link>https://www.netvasco.com.br/n/1/a?utm_source=rss&amp;utm_medium=x#topo</link><pubDate>${iso(1)}</pubDate><description><![CDATA[<p>Texto da matéria que NÃO pode ser guardado</p>]]></description></item>
<item><title>Notícia muito antiga do Vasco</title><link>https://www.netvasco.com.br/n/2</link><pubDate>${iso(24 * 20)}</pubDate></item>
<item><title>Link perigoso do Vasco</title><link>javascript:alert(1)</link><pubDate>${iso(1)}</pubDate></item>
<item><title>Vasco &#8211; título com &#x2014; entidades</title><guid isPermaLink="true">https://www.netvasco.com.br/n/3</guid><pubDate>${iso(2)}</pubDate></item>
</channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Vasco anuncia reforço para 2027</title><link rel="alternate" href="https://www.supervasco.com/x/"/><published>${new Date(NOW - 3600e3).toISOString()}</published></entry></feed>`;
const google = `<rss><channel><item><title>Vasco negocia com atacante do Grêmio - LANCE!</title><link>https://news.google.com/rss/articles/abc?oc=5</link><pubDate>${iso(3)}</pubDate><source url="https://www.lance.com.br">LANCE!</source></item>
<item><title>Flamengo vence no Maracanã - ge</title><link>https://news.google.com/rss/articles/def</link><pubDate>${iso(3)}</pubDate><source url="https://ge.globo.com">ge</source></item></channel></rss>`;

const raw = G.parseFeed(rss);
assert(raw.length === 4 && raw[0].title === 'Vasco & Palmeiras: escalações confirmadas', 'RSS: lê título sem HTML, com CDATA e entidades');
assert(raw[3].link === 'https://www.netvasco.com.br/n/3' && raw[3].title === 'Vasco – título com — entidades', 'RSS: usa o guid como link e decodifica entidades numéricas');
assert(!JSON.stringify(raw).includes('NÃO pode ser guardado'), 'o texto da matéria (description) não é guardado');
const atomItems = G.parseFeed(atom); assert(atomItems.length === 1 && atomItems[0].link === 'https://www.supervasco.com/x/', 'Atom: lê entradas e o link alternate');
const gItems = G.parseFeed(google); assert(gItems[0].publisher === 'LANCE!', 'Google Notícias: identifica o veículo original');

const src = {id:'netvasco', name:'NetVasco', feed_url:'https://www.netvasco.com.br/news/rss.xml', kind:'rss', reliability:'imprensa'};
const items = G.toItems(raw, src, NOW);
assert(items.length === 2, 'descarta notícia antiga (> 7 dias) e link javascript: (' + items.length + ' aproveitadas)');
assert(items[0].url === 'https://www.netvasco.com.br/n/1/a', 'remove utm_* e #âncora do link');
const gsrc = {id:'google', name:'Google Notícias', feed_url:'https://news.google.com/rss/search?q=Vasco', kind:'google', reliability:'agregador'};
const gi = G.toItems(gItems, gsrc, NOW);
assert(gi.length === 1 && gi[0].title === 'Vasco negocia com atacante do Grêmio' && gi[0].publisher === 'LANCE!', 'Google: tira " - Veículo" do título e descarta o que não é do Vasco');
assert(G.cleanText('a b​c<script>x</script>d') === 'a b c x d', 'remove caracteres invisíveis e tags');

/* ---------- segurança (SSRF) ---------- */
for (const [u, ok] of [['https://www.netvasco.com.br/news/rss.xml', true], ['http://www.netvasco.com.br/rss', false], ['https://localhost/feed', false], ['https://127.0.0.1/feed', false], ['https://[::1]/feed', false], ['https://10.0.0.5/x', false], ['https://intranet/x', false], ['https://db.supabase.internal/x', false], ['https://user:pw@site.com/x', false], ['https://site.com:8443/x', false], ['file:///etc/passwd', false]])
  assert(G.isSafeFeedUrl(u) === ok, `endereço ${ok ? 'aceito' : 'bloqueado'}: ${u}`);

/* ---------- classificação ---------- */
const cat = [['Cuesta passará por cirurgia e não jogará mais', 'medico'], ['Vasco contrata atacante para o feminino', 'feminino'], ['Vasco oferece R$ 21 milhões por joia da Seleção Sub-20', 'mercado'], ['Sub-17: Vasco enfrenta o Botafogo', 'base'], ['Relembre a Resposta Histórica', 'historia'], ['Presidente fala sobre a SAF', 'diretoria'], ['Clima pesado no vestiário após derrota', 'bastidores'], ['Abel acerta em troca e Palmeiras vence', 'profissional'], ['Conflito de interesses na venda', 'profissional']];
for (const [t, c] of cat) assert(G.categorize(t) === c, `categoria "${t}" → ${c} (veio ${G.categorize(t)})`);
assert(G.classifyStatus('Vasco tem interesse em zagueiro', 'imprensa') === 'rumor', 'rumor: "interesse"');
assert(G.classifyStatus('Vasco anuncia a contratação de zagueiro', 'imprensa') === 'confirmado', 'confirmado: "anuncia"');
assert(G.classifyStatus('Vasco negocia com zagueiro', 'imprensa') === 'apuracao', 'apuração: negociação noticiada');
assert(G.classifyStatus('Qualquer título', 'oficial') === 'confirmado', 'fonte oficial = confirmado');

/* ---------- duplicadas ---------- */
let k = 0; const uid = () => 'c' + (++k);
const mk = (title, publisher, h) => ({url:'https://x.com/' + (++k), title, publisher, source_id:'x', published_at:new Date(NOW - h * 36e5).toISOString(), category:'profissional', status:'apuracao'});
const { items: cl } = G.assignClusters([
  mk('Palmeiras x Vasco: onde assistir ao vivo, horário e escalações', 'ge', 5),
  mk('Athletico x Vasco: onde assistir ao vivo, horário e escalações', 'ge', 4),
  mk('Vasco quebra tabu contra o Athletico-PR e vence na Arena da Baixada', 'O GLOBO', 3),
  mk('Vasco vence Athletico-PR na Arena da Baixada e quebra tabu histórico', 'Papo na Colina', 2),
  mk('Vasco vence Athletico-PR na Arena da Baixada e quebra tabu histórico', 'Papo na Colina', 1),
], [], uid);
assert(cl[0].cluster_id !== cl[1].cluster_id, 'jogos diferentes (Palmeiras × Athletico) não são juntados');
assert(cl[2].cluster_id === cl[3].cluster_id && cl[3].cluster_size === 2, 'mesma notícia de 2 veículos vira 1 grupo (tamanho 2)');
assert(cl[4].cluster_size === 2, 'repetição do mesmo veículo não aumenta o grupo');
const { items: far } = G.assignClusters([mk('Vasco vence Athletico-PR na Arena da Baixada e quebra tabu histórico', 'ge', 1)], [{title:'Vasco vence Athletico-PR na Arena da Baixada e quebra tabu histórico', cluster_id:'old', publisher:'x', published_at:new Date(NOW - 80 * 36e5).toISOString()}], uid);
assert(far[0].cluster_id !== 'old', 'notícias com mais de 48 h de diferença não são juntadas');

/* ---------- execução completa com banco e feeds simulados ---------- */
const DB = { runs:[], sources:[
  {id:'netvasco', name:'NetVasco', feed_url:'https://www.netvasco.com.br/news/rss.xml', kind:'rss', reliability:'imprensa', active:true},
  {id:'super', name:'SuperVasco', feed_url:'https://www.supervasco.com/feed/', kind:'rss', reliability:'blog', active:true},
  {id:'quebrado', name:'Quebrado', feed_url:'https://quebrado.com/feed', kind:'rss', reliability:'blog', active:true},
  {id:'redirecionado', name:'Redireciona', feed_url:'https://redir.com/feed', kind:'rss', reliability:'blog', active:true},
  {id:'gigante', name:'Gigante', feed_url:'https://gigante.com/feed', kind:'rss', reliability:'blog', active:true},
  {id:'off', name:'Desligada', feed_url:'https://off.com/feed', kind:'rss', reliability:'blog', active:false}], items:[], admins:['00000000-0000-0000-0000-00000000000a'], fetched:[] };
const resp = (status, body, headers = {}) => new Response(status === 204 ? null : body, {status, headers});
let clock = NOW;
const fakeFetch = async (url, init = {}) => {
  const u = new URL(url); const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : null;
  if (u.hostname === 'proj.supabase.co') {
    if (init.headers.apikey !== 'service-key') return resp(401, '{}');
    const p = u.pathname, q = u.searchParams;
    if (p === '/auth/v1/user') return init.headers.Authorization === 'Bearer aa.bb.cc' ? resp(200, JSON.stringify({id:'00000000-0000-0000-0000-00000000000a'})) : resp(401, '{}');
    if (p === '/rest/v1/admins') return resp(200, JSON.stringify(DB.admins.includes(q.get('user_id').slice(3)) ? [{user_id:q.get('user_id').slice(3)}] : []));
    if (p === '/rest/v1/news_runs' && method === 'GET') return resp(200, JSON.stringify(DB.runs.slice().reverse().slice(0, 1)));
    if (p === '/rest/v1/news_runs' && method === 'POST') { const r = {id:DB.runs.length + 1, started_at:new Date(clock).toISOString(), ...body}; DB.runs.push(r); return resp(201, JSON.stringify([r])); }
    if (p === '/rest/v1/news_runs' && method === 'PATCH') { Object.assign(DB.runs.find(r => 'eq.' + r.id === q.get('id')) || {}, body); return resp(204, ''); }
    if (p === '/rest/v1/news_runs' && method === 'DELETE') return resp(204, '');
    if (p === '/rest/v1/news_sources' && method === 'GET') return resp(200, JSON.stringify(DB.sources.filter(s => s.active)));
    if (p === '/rest/v1/news_sources' && method === 'PATCH') { Object.assign(DB.sources.find(s => 'eq.' + s.id === q.get('id')), body); return resp(204, ''); }
    if (p === '/rest/v1/news_items' && method === 'GET') return resp(200, JSON.stringify(DB.items));
    if (p === '/rest/v1/news_items' && method === 'POST') { const ins = body.filter(b => !DB.items.some(x => x.url === b.url)).map(b => ({id:'i' + (DB.items.length + 1), ...b})); DB.items.push(...ins); return resp(201, JSON.stringify(ins)); }
    if (p === '/rest/v1/news_items' && method === 'PATCH') { DB.items.filter(x => 'eq.' + x.cluster_id === q.get('cluster_id')).forEach(x => Object.assign(x, body)); return resp(204, ''); }
    if (p === '/rest/v1/news_items' && method === 'DELETE') return resp(204, '');
    return resp(404, 'rota não simulada ' + method + ' ' + p);
  }
  DB.fetched.push(url);
  if (init.redirect !== 'manual') return resp(500, 'o robô deve seguir redirecionamentos manualmente');
  if (u.hostname === 'www.netvasco.com.br') return resp(200, rss, {'content-type':'application/rss+xml; charset=utf-8'});
  if (u.hostname === 'www.supervasco.com') return resp(200, atom, {'content-type':'application/atom+xml'});
  if (u.hostname === 'quebrado.com') return resp(503, 'fora do ar');
  if (u.hostname === 'redir.com') return resp(302, '', {location:'https://127.0.0.1/admin'});
  if (u.hostname === 'gigante.com') return resp(200, 'x', {'content-length':String(10 * 1024 * 1024)});
  return resp(404, '');
};
const env = k2 => ({SUPABASE_URL:'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'service-key'})[k2];
let n = 0; const deps = {fetch:fakeFetch, env, now:() => clock, uuid:() => 'u' + (++n)};

const r1 = await G.runGiro({trigger:'cron'}, deps);
assert(r1.status === 200 && r1.body.ran && r1.body.items_new === 3, 'execução grava as notícias novas (' + r1.body.items_new + ')');
assert(r1.body.sources_ok === 2 && r1.body.sources_fail === 3, 'conta fontes lidas e com falha');
assert(!DB.fetched.some(u => u.includes('off.com')), 'fonte desativada não é lida');
assert(!DB.fetched.some(u => u.includes('127.0.0.1')), 'redirecionamento para endereço interno é bloqueado (SSRF)');
const sQ = DB.sources.find(s => s.id === 'quebrado'), sR = DB.sources.find(s => s.id === 'redirecionado'), sG = DB.sources.find(s => s.id === 'gigante');
assert(sQ.last_ok === false && /HTTP 503/.test(sQ.last_error), 'falha da fonte fica registrada: ' + sQ.last_error);
assert(/não permitido/.test(sR.last_error) && /grande demais/.test(sG.last_error), 'motivos registrados: redirecionamento e tamanho');
assert(DB.items.every(i => !('description' in i)) && DB.items.every(i => /^https:/.test(i.url)), 'só título/link/horário são gravados');
assert(DB.runs[0].finished_at && DB.runs[0].trigger === 'cron' && DB.runs[0].items_new === 3, 'execução registrada no histórico');

clock += 60e3;
const r2 = await G.runGiro({trigger:'visitante'}, deps);
assert(!r2.body.ran && r2.body.reason === 'recente' && r2.body.next_in_s > 0, 'visitante não consegue disparar de novo antes de 5 min');
const r3 = await G.runGiro({trigger:'visitante', authorization:'Bearer aa.bb.cc'}, deps);
assert(r3.body.ran && r3.body.trigger === 'admin' && r3.body.items_new === 0, 'admin pode forçar; links repetidos não são gravados de novo');
const r4 = await G.runGiro({trigger:'visitante', authorization:'Bearer xx.yy.zz'}, deps);
assert(!r4.body.ran, 'token inválido é tratado como visitante comum');
clock += 6 * 60e3;
const r5 = await G.runGiro({trigger:'visitante'}, deps);
assert(r5.body.ran && r5.body.trigger === 'visitante', 'depois de 5 min o visitante pode pedir nova busca');
const r6 = await G.runGiro({}, {...deps, env:() => undefined});
assert(r6.status === 500 && r6.body.error === 'configuração ausente', 'sem configuração, recusa com erro claro');
