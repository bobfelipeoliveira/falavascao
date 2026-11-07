const {JSDOM} = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8'); const errors = [];
const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://localhost/', pretendToBeVisual:true, beforeParse(w){ w.scrollTo=()=>{}; w.console.error=(...a)=>errors.push(a.join(' ')); }});
const w = dom.window, d = w.document; const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(1200);
  console.log('chooser auto-aberto:', !!d.querySelector('[data-skin-k]'));
  for (const k of ['app','game','editorial','classico']) {
    d.querySelector(`[data-skin-k="${k}"]`) ? d.querySelector(`[data-skin-k="${k}"]`).click() : (w.eval('Skin.chooser()'), d.querySelector(`[data-skin-k="${k}"]`).click());
    await sleep(20);
    let bad = [];
    for (const r of ['inicio','historia/idolos','games','games/quiz','lamachia','estatisticas','perfil','noticias']) { w.location.hash = '#/'+r; await sleep(25); if (d.querySelector('#view').textContent.includes('Algo deu errado')) bad.push(r); }
    w.location.hash = '#/historia/idolos'; await sleep(25);
    console.log(k, 'skin attr=', d.documentElement.dataset.skin || '(classico)', 'falhas:', bad, 'fut cards:', d.querySelectorAll('.fut').length, 'saved:', w.localStorage.getItem('falavascao:skin'));
    w.location.hash = '#/inicio'; await sleep(25);
  }
  console.log('countdown:', d.querySelector('[data-cd]') && d.querySelector('[data-cd]').textContent);
  console.log('errors', errors.filter(e=>!/Not implemented/.test(e)));
  process.exit();
})();
