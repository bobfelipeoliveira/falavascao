/* =====================================================================
   GIRO DA COLINA — robô de notícias do Fala, Vascão! (Supabase Edge Function)

   O que faz, a cada execução:
     1. lê as fontes ATIVAS cadastradas pelo admin (tabela news_sources);
     2. baixa o feed RSS/Atom de cada uma (só https, com limite de tempo e tamanho);
     3. guarda título, veículo, horário e link — NUNCA o texto da matéria;
     4. remove duplicadas (mesmo link) e agrupa a mesma notícia de veículos diferentes;
     5. classifica categoria e grau de confirmação (automático, corrigível pelo admin).

   Quem pode disparar: o agendador (cron), qualquer visitante (no máximo 1 busca a cada
   5 minutos, para todo o site) e o admin (sem espera). A chave secreta usada para gravar
   existe só aqui dentro do Supabase (variável de ambiente), nunca no site nem no GitHub.

   Implantação: Supabase › Edge Functions › Deploy a new function › Via Editor,
   nome "giro-da-colina", colar este arquivo e DESLIGAR "Verify JWT" (a função faz a própria
   verificação). Sem dependências externas (menos risco de cadeia de suprimentos).
   ===================================================================== */

export type RawItem = { title: string; link: string; published: string; publisher: string };
export type Source = { id: string; name: string; feed_url: string; kind: string; reliability: string; active?: boolean };
export type Item = {
  url: string; title: string; publisher: string; source_id: string; published_at: string;
  category: string; status: string; cluster_id: string; cluster_size: number;
};

export const MIN_INTERVAL_MS = 5 * 60 * 1000;     // intervalo mínimo entre buscas disparadas por visitantes
export const FETCH_TIMEOUT_MS = 12000;
export const MAX_FEED_BYTES = 3 * 1024 * 1024;
export const MAX_AGE_DAYS = 7;                     // notícias mais antigas que isso não entram
export const KEEP_DAYS = 45;                       // limpeza automática
const ALLOWED_ORIGINS = ['https://bobfelipeoliveira.github.io', 'null'];
const UA = 'FalaVascaoBot/1.0 (+https://bobfelipeoliveira.github.io/falavascao/)';

/* ---------------- texto ---------------- */
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m: string, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]', 'g');
/** Texto puro, sem HTML, sem caracteres de controle, com tamanho máximo. */
export function cleanText(s: string, max = 300): string {
  let t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = t.replace(/<[^>]*>/g, ' ');
  t = decodeEntities(t);
  t = t.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
function escRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function tag(block: string, name: string): string {
  const m = new RegExp(`<${escRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escRe(name)}>`, 'i').exec(block);
  return m ? m[1] : '';
}
function attr(block: string, tagName: string, attrName: string, where?: RegExp): string {
  const re = new RegExp(`<${escRe(tagName)}\\b([^>]*)/?>`, 'gi'); let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    if (where && !where.test(m[1])) continue;
    const a = new RegExp(`\\b${escRe(attrName)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(m[1]);
    if (a) return decodeEntities(a[2] ?? a[3] ?? '');
  }
  return '';
}

/** Lê RSS 2.0 e Atom. Devolve só o necessário (título, link, data, veículo). */
export function parseFeed(xml: string): RawItem[] {
  const out: RawItem[] = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of items) {
    let link = cleanText(tag(b, 'link'), 2000);
    if (!link) { const g = tag(b, 'guid'); if (/^https?:\/\//i.test(cleanText(g))) link = cleanText(g, 2000); }
    out.push({ title: cleanText(tag(b, 'title')), link, published: cleanText(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published')), publisher: cleanText(tag(b, 'source'), 80) });
  }
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of entries) {
    const link = attr(b, 'link', 'href', /rel\s*=\s*["']alternate["']/i) || attr(b, 'link', 'href');
    out.push({ title: cleanText(tag(b, 'title')), link: cleanText(link, 2000), published: cleanText(tag(b, 'published') || tag(b, 'updated')), publisher: '' });
  }
  return out.slice(0, 200);
}

/** O Google Notícias põe " - Veículo" no fim do título. */
export function stripPublisherSuffix(title: string, publisher: string): string {
  if (publisher && title.toLowerCase().endsWith(' - ' + publisher.toLowerCase())) return title.slice(0, -(publisher.length + 3)).trim();
  return title;
}

/** Normaliza o link: só http(s), sem #âncora e sem parâmetros de rastreamento. */
export function normalizeUrl(u: string): string | null {
  let x: URL; try { x = new URL(u.trim()); } catch { return null; }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') return null;
  if (x.username || x.password) return null;
  x.hash = ''; x.hostname = x.hostname.toLowerCase();
  for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ocid$|oc$|cmpid$|mc_)/i.test(k)) x.searchParams.delete(k);
  let s = x.toString(); if (x.pathname.length > 1 && s.endsWith('/') && !x.search) s = s.slice(0, -1);
  return s;
}

/** Proteção contra SSRF: só https, sem IP literal, sem host interno. */
export function isSafeFeedUrl(u: string): boolean {
  let x: URL; try { x = new URL(u); } catch { return false; }
  if (x.protocol !== 'https:' || x.username || x.password) return false;
  if (x.port && x.port !== '443') return false;
  const h = x.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|supabase\.internal)$/.test(h)) return false;
  return true;
}

/* ---------------- semelhança entre títulos ---------------- */
const STOP = new Set(('a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem sobre entre ate apos e ou mas que se ao aos sua seu suas seus ele ela eles elas isso este esta esse essa ja mais menos muito pode vai vem tem ter ser foi sao como quando onde qual quais the vasco gama cruzmaltino cruz maltino time clube equipe jogo veja confira video ao vivo hoje agora diz afirma fala'.split(' ')));
export function norm(s: string): string { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
export function tokens(title: string): string[] {
  return [...new Set(norm(title).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)))];
}
export function jaccard(a: string[], b: string[]): { j: number; inter: number } {
  const B = new Set(b); let inter = 0; for (const w of a) if (B.has(w)) inter++;
  const uni = new Set([...a, ...b]).size; return { j: uni ? inter / uni : 0, inter };
}
/** Palavras genéricas de cobertura de jogo: não servem para dizer que dois títulos são o mesmo assunto. */
const GENERIC = new Set('onde assistir vivo horario horarios escalacao escalacoes provavel provaveis palpite palpites tempo real transmissao canal jogo partida rodada semifinal final quartas oitavas copa brasil brasileirao serie carioca campeonato libertadores sul-americana sulamericana contra pelo pela apos antes durante noticias ultimas informacoes tudo sobre analise'.split(' '));
/** Adversário num título do tipo "Palmeiras x Vasco" (para não juntar jogos diferentes). */
export function opponent(title: string): string {
  const m = /([a-z][a-z-]*)\s+x\s+([a-z][a-z-]*)/.exec(norm(title));
  if (!m) return '';
  const [a, b] = [m[1], m[2]]; return a === 'vasco' ? b : b === 'vasco' ? a : '';
}
/** Mesma notícia em veículos diferentes? (títulos parecidos o bastante e sobre o mesmo jogo/assunto) */
export function similar(a: string[], b: string[], oppA = '', oppB = ''): boolean {
  if (oppA && oppB && oppA.slice(0, 5) !== oppB.slice(0, 5)) return false;
  const sa = a.filter(w => !GENERIC.has(w)), sb = b.filter(w => !GENERIC.has(w));
  const { j, inter } = jaccard(sa, sb);
  return (j >= 0.5 && inter >= 3) || (j >= 0.7 && inter >= 2);
}

/* ---------------- classificação automática ---------------- */
const CAT_RULES: Array<[string, RegExp]> = [
  ['medico', /\b(lesao|lesionad|contus|departamento medico|\bdm\b|cirurgi|fratur|ligamento|estiramento|desfalque por|exames?|recupera[cç]ao|volta aos treinos|tratamento|edema)/],
  ['feminino', /\b(feminino|feminina|gigantes da colina|brasileirao fem|meninas)/],
  ['diretoria', /\b(saf|presidente|diretoria|conselho|eleicao|assembleia|investidor|ceo|diretor executivo|diretor de futebol|financ|divida|recuperacao judicial|balanco|patrocin|orcamento|sao januario.*(obra|reforma|projeto))/],
  ['mercado', /\b(contrat|reforco|negoci|proposta|oferece r|oferta|emprestimo|empresta|venda d|vende|vendid|renova|rescis|acert(a|o|ou) (com|a contratacao|a ida|a saida|a venda|a renovacao|o emprestimo)|sondag|interesse\b|alvo|na mira|janela|chegada de|anuncia(do)? .*(atacante|zagueiro|volante|meia|lateral|goleiro)|assina|multa rescis|clausula|transferencia|joia)/],
  ['base', /\b(sub-?\s?\d{2}|categorias? de base|da base|na base|copinha|cria da base|juniores|juvenil|infantil)\b/],
  ['historia', /\b(historia|historic|ha \d+ anos|relembre|memoria|aniversario|idolo|lenda|resposta historica|1898|1923|1924|1948|1997|1998|2000|2011)\b/],
  ['bastidores', /\b(bastidor|vestiario|clima|crise|cobranca|desabafo|polemica|briga|discuss|reuniao|insatisf|torcida organizada|protesto|elenco racha)/],
];
export function categorize(title: string): string {
  const t = norm(title);
  for (const [cat, re] of CAT_RULES) if (re.test(t)) return cat;
  return 'profissional';
}
const RUMOR = /\b(rumor|especula|sonda|sondagem|na mira|mira |interesse\b|interessad|avalia|cogita|teria|estaria|seria|poderia|pode deixar|pode chegar|pode ser|possivel|possibilidade|nome ventilado|ventilad|monitora|observa|especulad|segundo rumores)/;
const CONFIRMED = /\b(anuncia|anunciado|oficializa|oficializado|e oficial|oficial:|confirma|confirmado|assina contrato|apresentado|apresenta|renova contrato|vence|venceu|empata|empatou|perde|perdeu|goleia|derrota|\d+\s?x\s?\d+)/;
export function classifyStatus(title: string, reliability: string): string {
  const t = norm(title);
  if (reliability === 'oficial') return 'confirmado';
  if (RUMOR.test(t)) return 'rumor';
  if (CONFIRMED.test(t)) return 'confirmado';
  return 'apuracao';
}
/** Assunto ligado ao Vasco? (usado nas buscas genéricas do Google Notícias) */
export function aboutVasco(title: string): boolean { return /\b(vasco|cruz-?maltin|colina|sao januario|vascain)/.test(norm(title)); }

/* ---------------- download seguro do feed ---------------- */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const len = Number(res.headers.get('content-length') || 0); if (len > max) throw new Error('feed grande demais');
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > max) { try { await reader.cancel(); } catch { /* */ } throw new Error('feed grande demais'); } chunks.push(value); }
  const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
function decodeBody(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 200));
  const label = (/charset=([\w-]+)/i.exec(contentType || '') || /encoding=["']([\w-]+)["']/i.exec(head) || [])[1] || 'utf-8';
  try { return new TextDecoder(label.toLowerCase()).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}
export async function fetchFeed(url: string, f: typeof fetch): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isSafeFeedUrl(current)) throw new Error('endereço do feed não permitido');
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await f(current, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
      if (res.status >= 300 && res.status < 400) { const loc = res.headers.get('location'); if (!loc) throw new Error('redirecionamento sem destino'); current = new URL(loc, current).toString(); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return decodeBody(await readCapped(res, MAX_FEED_BYTES), res.headers.get('content-type') || '');
    } catch (e) { const err = e as Error; throw new Error(err.name === 'AbortError' ? 'tempo esgotado' : err.message); }
    finally { clearTimeout(timer); }
  }
  throw new Error('redirecionamentos demais');
}

/** Converte os itens de um feed em notícias prontas para gravar (sem repetir links). */
export function toItems(raw: RawItem[], src: Source, now: number): Omit<Item, 'cluster_id' | 'cluster_size'>[] {
  const out: Omit<Item, 'cluster_id' | 'cluster_size'>[] = []; const seen = new Set<string>();
  for (const r of raw) {
    const url = normalizeUrl(r.link); if (!url || seen.has(url)) continue;
    const publisher = (src.kind === 'google' && r.publisher) ? r.publisher : src.name;
    const title = cleanText(stripPublisherSuffix(r.title, r.publisher), 300);
    if (title.length < 8) continue;
    if (src.kind === 'google' && !aboutVasco(title)) continue;
    let t = Date.parse(r.published); if (!Number.isFinite(t) || t > now + 3600e3) t = now;
    if (now - t > MAX_AGE_DAYS * 864e5) continue;
    seen.add(url);
    out.push({ url, title, publisher: cleanText(publisher, 80) || src.name, source_id: src.id, published_at: new Date(t).toISOString(), category: categorize(title), status: classifyStatus(title, src.reliability) });
  }
  return out;
}

/** Agrupa a mesma notícia de veículos diferentes. Retorna os novos itens com cluster definido e os grupos alterados. */
export const CLUSTER_WINDOW_MS = 48 * 3600e3;
export function assignClusters(fresh: Omit<Item, 'cluster_id' | 'cluster_size'>[], existing: Array<{ title: string; cluster_id: string; publisher: string; published_at: string }>, uuid: () => string) {
  const pool = existing.map(e => ({ tk: tokens(e.title), opp: opponent(e.title), t: Date.parse(e.published_at), cluster_id: e.cluster_id, publisher: e.publisher }));
  const touched = new Set<string>(); const out: Item[] = [];
  for (const it of fresh) {
    const tk = tokens(it.title), opp = opponent(it.title), t = Date.parse(it.published_at); let best: { c: string; j: number } | null = null;
    for (const p of pool) {
      if (Math.abs(t - p.t) > CLUSTER_WINDOW_MS || !similar(tk, p.tk, opp, p.opp)) continue;
      const { j } = jaccard(tk, p.tk); if (!best || j > best.j) best = { c: p.cluster_id, j };
    }
    const cluster_id = best ? best.c : uuid();
    pool.push({ tk, opp, t, cluster_id, publisher: it.publisher }); touched.add(cluster_id);
    out.push({ ...it, cluster_id, cluster_size: 1 });
  }
  const sizes: Record<string, number> = {};
  for (const c of touched) sizes[c] = new Set(pool.filter(p => p.cluster_id === c).map(p => p.publisher.toLowerCase())).size;
  for (const it of out) it.cluster_size = Math.min(100, sizes[it.cluster_id] || 1);
  return { items: out, sizes };
}

/* ---------------- execução ---------------- */
export type Deps = { fetch: typeof fetch; env: (k: string) => string | undefined; now?: () => number; uuid?: () => string };
export type RunResult = { status: number; body: Record<string, unknown> };

export async function runGiro(req: { authorization?: string; trigger?: string }, d: Deps): Promise<RunResult> {
  const base = (d.env('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = d.env('SUPABASE_SERVICE_ROLE_KEY') || d.env('SUPABASE_SECRET_KEY') || '';
  if (!base || !key) return { status: 500, body: { error: 'configuração ausente' } };
  const now = (d.now || Date.now)(), uuid = d.uuid || (() => crypto.randomUUID());
  const svc: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }; if (key.startsWith('eyJ')) svc.Authorization = 'Bearer ' + key;
  const db = async (path: string, init: RequestInit = {}) => {
    const res = await d.fetch(base + path, { ...init, headers: { ...svc, ...(init.headers as Record<string, string> || {}) } });
    const txt = await res.text(); if (!res.ok) throw new Error(`banco ${res.status}: ${txt.slice(0, 120)}`);
    return txt ? JSON.parse(txt) : null;
  };

  // 1) quem chamou? admin pode forçar; os demais respeitam o intervalo mínimo
  let isAdmin = false;
  const bearer = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(req.authorization || '');
  if (bearer) {
    try {
      const ures = await d.fetch(base + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + bearer[1] } });
      if (ures.ok) { const u = await ures.json(); if (u && /^[0-9a-f-]{36}$/i.test(u.id)) isAdmin = ((await db(`/rest/v1/admins?select=user_id&user_id=eq.${u.id}`)) || []).length > 0; }
    } catch { isAdmin = false; }
  }
  const trigger = isAdmin ? 'admin' : (req.trigger === 'cron' ? 'cron' : 'visitante');
  const last = ((await db('/rest/v1/news_runs?select=started_at,finished_at&order=started_at.desc&limit=1')) || [])[0];
  if (last && !isAdmin) {
    const since = now - Date.parse(last.started_at);
    if (since < MIN_INTERVAL_MS) return { status: 200, body: { ran: false, reason: 'recente', last_run: last.finished_at || last.started_at, next_in_s: Math.ceil((MIN_INTERVAL_MS - since) / 1000) } };
  }

  // 2) registra a execução
  const run = (await db('/rest/v1/news_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ trigger }) }))[0];
  let ok = 0, fail = 0, inserted = 0; let runError: string | null = null;
  try {
    const sources: Source[] = (await db('/rest/v1/news_sources?select=id,name,feed_url,kind,reliability&active=eq.true')) || [];
    const fresh: Omit<Item, 'cluster_id' | 'cluster_size'>[] = []; const seen = new Set<string>();
    const results = await Promise.allSettled(sources.map(s => fetchFeed(s.feed_url, d.fetch).then(xml => toItems(parseFeed(xml), s, now))));
    for (let i = 0; i < sources.length; i++) {
      const r = results[i], s = sources[i];
      const patch = r.status === 'fulfilled'
        ? { last_fetch_at: new Date(now).toISOString(), last_ok: true, last_error: null, last_count: r.value.length }
        : { last_fetch_at: new Date(now).toISOString(), last_ok: false, last_error: cleanText(String((r.reason && r.reason.message) || r.reason), 280) };
      if (r.status === 'fulfilled') { ok++; for (const it of r.value) if (!seen.has(it.url)) { seen.add(it.url); fresh.push(it); } } else fail++;
      await db(`/rest/v1/news_sources?id=eq.${encodeURIComponent(s.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    }
    // 3) só o que ainda não existe; agrupa com as notícias das últimas 72 h
    const since72 = new Date(now - 72 * 3600e3).toISOString();
    const recent: Array<{ url: string; title: string; cluster_id: string; publisher: string; published_at: string }> = (await db(`/rest/v1/news_items?select=url,title,cluster_id,publisher,published_at&published_at=gte.${since72}&limit=3000`)) || [];
    const known = new Set(recent.map(r => r.url));
    const novel = fresh.filter(it => !known.has(it.url)).sort((a, b) => a.published_at.localeCompare(b.published_at));
    if (novel.length) {
      const { items, sizes } = assignClusters(novel, recent, uuid);
      for (let i = 0; i < items.length; i += 200) {
        const rows = await db('/rest/v1/news_items?on_conflict=url', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(items.slice(i, i + 200)) });
        inserted += (rows || []).length;
      }
      for (const [c, n] of Object.entries(sizes)) if (n > 1) await db(`/rest/v1/news_items?cluster_id=eq.${c}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ cluster_size: Math.min(100, n) }) });
    }
    // 4) limpeza
    await db(`/rest/v1/news_items?published_at=lt.${new Date(now - KEEP_DAYS * 864e5).toISOString()}&featured=eq.false`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await db(`/rest/v1/news_runs?started_at=lt.${new Date(now - 30 * 864e5).toISOString()}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  } catch (e) { runError = cleanText(String((e as Error).message || e), 280); }
  const finished = new Date((d.now || Date.now)()).toISOString();
  await db(`/rest/v1/news_runs?id=eq.${run.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ finished_at: finished, sources_ok: ok, sources_fail: fail, items_new: inserted, error: runError }) });
  return { status: runError ? 500 : 200, body: { ran: true, trigger, items_new: inserted, sources_ok: ok, sources_fail: fail, finished_at: finished, error: runError ? 'falha ao gravar; detalhes no registro do robô' : undefined } };
}

/* ---------------- servidor (só no Supabase/Deno) ---------------- */
declare const Deno: { serve: (h: (r: Request) => Promise<Response>) => void; env: { get: (k: string) => string | undefined } };
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
function cors(origin: string | null): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(async (req: Request) => {
    const h = cors(req.headers.get('origin'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'use POST' }), { status: 405, headers: { ...h, 'Content-Type': 'application/json' } });
    let trigger = 'visitante';
    try { const b = await req.json(); if (b && typeof b.trigger === 'string') trigger = b.trigger.slice(0, 20); } catch { /* corpo vazio */ }
    const deps: Deps = { fetch, env: k => Deno.env.get(k) };
    // Agendador: responde na hora e continua a busca em segundo plano (o cron espera só alguns segundos).
    if (trigger === 'cron' && typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      EdgeRuntime.waitUntil(runGiro({ authorization: '', trigger }, deps).catch(e => console.error('giro-da-colina (cron)', e)));
      return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { ...h, 'Content-Type': 'application/json' } });
    }
    try {
      const r = await runGiro({ authorization: req.headers.get('authorization') || '', trigger }, deps);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...h, 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('giro-da-colina', e);
      return new Response(JSON.stringify({ error: 'falha interna' }), { status: 500, headers: { ...h, 'Content-Type': 'application/json' } });
    }
  });
}
