const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user-QuarmBossTracker/ee25763f-05a7-5a49-9c06-997752d27c3e/scratchpad/ui-mocks/';
fs.mkdirSync(OUT, { recursive: true });

const MONO = '"Cascadia Code", Consolas, ui-monospace, monospace';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const dirs = {
  a: { name: 'A Terminal', body: MONO, num: MONO, title: MONO, titleColor: 'var(--gold)', titleWeight: 700, titleTrack: '0', head: '' },
  b: { name: 'B Clean UI', body: SANS, num: MONO, title: SANS, titleColor: 'var(--text)', titleWeight: 650, titleTrack: '-0.01em', head: '' },
  c: { name: 'C Brand', body: MONO, num: MONO, title: '"Prata", Georgia, serif', titleColor: 'var(--bone)', titleWeight: 400, titleTrack: '0', head: '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Prata&display=swap" rel="stylesheet">' },
};

const chars = [
  ['Aldenmar', 53, [3,3,6,5,2]],
  ['Brackwyn', 47, [3,3,6,2,0]],
  ['Corvale', 32, [3,1,0,0,0]],
  ['Rethlan', 24, [2,0,0,0,0]],
  ['Nyssara', 12, [0,0,0,0,0]],
];
const max = [3,3,6,5,5];
const cols = ['Storms','Valor','Sol Ro','Air','Time'];
const cell = (v,m) => `<span class="num ${v===m?'done':v===0?'zero':'part'}">${v}/${m}</span>`;

const rowsDesktop = chars.map(([n,l,v]) => `<tr><td class="name">${n} <span class="dim">(${l})</span></td><td class="r num">${v.reduce((a,b)=>a+b,0)}/22</td>${v.map((x,i)=>`<td class="r">${cell(x,max[i])}</td>`).join('')}</tr>`).join('');
const rowsPhone = chars.map(([n,l,v]) => `<div class="mrow"><div class="mhead"><span class="name">${n} <span class="dim">(${l})</span></span><span class="num dim">${v.reduce((a,b)=>a+b,0)}/22 flags</span></div><div class="mgrid">${v.map((x,i)=>`<div><div class="lbl">${cols[i]}</div>${cell(x,max[i])}</div>`).join('')}</div></div>`).join('');

const zones = [['Plane of Valor',null],['Plane of Torment',null],['Plane of Tactics','Valor 3/3'],['Solusek Ro Hall',null],['Plane of Air','Storms 3/3'],['Plane of Earth','Air 5/5'],['Plane of Time','Air 5/5'],['Bastion of Thunder',null]];
const zonesHtml = zones.map(([z,m]) => `<li><span>${z}</span>${m?`<span class="dim">missing ${m}</span>`:'<span class="green">yes</span>'}</li>`).join('');

const css = (d) => `
:root{
  --bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#c9d1d9;--dim:#6e7681;--accent:#1f6feb;--blue:#58a6ff;--purple:#a371f7;
  --green:#56d364;--red:#f85149;--gold:#d29922;--orange:#ffa657;--raised:#21262d;--bone:#f2ede1;
  --f-body:${d.body};--f-num:${d.num};--f-title:${d.title};
}
*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font:400 13px/1.45 var(--f-body);min-height:100vh}
.num{font-family:var(--f-num);font-variant-numeric:tabular-nums}
.dim{color:var(--dim)}.green{color:var(--green)}
a{color:var(--blue);text-decoration:none}
/* header */
.hdr{height:48px;border-bottom:1px solid var(--border);background:var(--panel);display:flex;align-items:center;gap:24px;padding:0 24px}
.word{font-size:15px;font-weight:700;color:var(--text);letter-spacing:.01em;display:flex;align-items:center;gap:8px}
.word img{width:28px;height:28px;border-radius:6px;display:block}
.nav{display:flex;gap:4px;flex:1}
.nav a{color:var(--dim);padding:4px 12px;border-radius:4px;font-size:13px}
.nav a.on{color:var(--text);background:var(--raised)}
.acct{display:flex;align-items:center;gap:8px;background:var(--raised);border:1px solid var(--border);border-radius:999px;padding:3px 12px 3px 4px;font-size:13px;height:32px}
.acct b{width:24px;height:24px;border-radius:999px;background:var(--accent);color:#fff;font-size:11px;display:grid;place-items:center}
.menu{display:none}
/* layout */
.wrap{max-width:1100px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:160px 1fr;gap:32px}
.rail{display:flex;flex-direction:column;gap:4px;align-self:start}
.rail a{color:var(--dim);padding:8px 12px;border-radius:4px;border-left:2px solid transparent;font-size:13px}
.rail a.on{color:var(--text);background:var(--panel);border-left-color:var(--accent)}
.main{min-width:0}
.tb{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin-bottom:4px}
h1{font:${d.titleWeight} 24px/1.2 var(--f-title);color:${d.titleColor};letter-spacing:${d.titleTrack};margin-bottom:4px}
.desc{color:var(--dim)}
.acts{display:flex;gap:8px;flex-shrink:0}
.btn{font:600 13px/1 var(--f-body);height:32px;padding:0 16px;border-radius:4px;border:1px solid var(--border);background:var(--raised);color:var(--text);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.ghost{background:transparent;border-color:transparent;color:var(--blue)}
.seg{display:inline-flex;gap:4px;padding:4px;background:var(--panel);border:1px solid var(--border);border-radius:999px;margin-bottom:16px;max-width:100%;overflow-x:auto}
.seg span{padding:4px 16px;border-radius:999px;color:var(--dim);white-space:nowrap;font-size:13px}
.seg span.on{background:var(--accent);color:#fff}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px}
.card h2{font:600 15px/1.3 var(--f-body);color:var(--text);margin-bottom:12px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.two .card{margin-bottom:0}
table{width:100%;border-collapse:collapse}
th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);font-weight:500;text-align:left;padding:0 8px 8px}
td{padding:8px;border-top:1px solid var(--border)}
th.r,td.r{text-align:right}
td.name{font-weight:600;color:var(--text)}
.done{color:var(--green)}.part{color:var(--text)}.zero{color:var(--dim)}
.tbl-m{display:none}
ul.bul{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px}
ul.bul li{padding-left:16px;position:relative}
ul.bul li:before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:999px;background:var(--gold)}
ul.zl{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;column-gap:24px}
ul.zl li{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--border)}
ul.zl li span:last-child{white-space:nowrap}
.chip{display:inline-block;font:600 11px/1 var(--f-num);padding:4px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
.chip.g{background:rgba(86,211,100,.15);color:var(--green)}.chip.r{background:rgba(248,81,73,.15);color:var(--red)}
.chip.y{background:rgba(210,153,34,.15);color:var(--gold)}.chip.o{background:rgba(255,166,87,.15);color:var(--orange)}
.cardhd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.cardhd h2{margin:0}
.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
.pills{display:none}
/* phone */
@media (max-width:760px){
  .hdr{padding:0 16px;gap:8px;justify-content:space-between}
  .nav,.acct .t{display:none}
  .acct{padding:3px;width:32px;justify-content:center}
  .hdr .right{display:flex;gap:8px}
  .menu{display:inline-flex;height:44px;min-width:44px;border:1px solid var(--border);background:var(--raised);color:var(--text);border-radius:4px;align-items:center;justify-content:center;font-size:15px}
  .hdr{height:56px}
  .wrap{display:block;padding:16px}
  .rail{display:none}
  .pills{display:flex;gap:8px;overflow-x:auto;margin:0 -16px 16px;padding:0 16px;-webkit-overflow-scrolling:touch}
  .pills a{flex:none;min-height:44px;display:inline-flex;align-items:center;padding:0 16px;border-radius:999px;background:var(--raised);color:var(--dim);border:1px solid var(--border)}
  .pills a.on{background:var(--accent);border-color:var(--accent);color:#fff}
  .tb{flex-direction:column;align-items:stretch;gap:16px;margin-bottom:16px}
  h1{font-size:20px}
  .acts{flex-direction:column-reverse}
  .btn{min-height:44px;height:44px}
  .seg{display:flex;margin-bottom:12px}
  .seg span{padding:12px 16px;flex:none}
  .card{padding:12px;margin-bottom:12px}
  .two{grid-template-columns:1fr;gap:12px}
  .tbl-d{display:none}.tbl-m{display:flex;flex-direction:column;gap:8px}
  .mrow{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px}
  .mhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;gap:8px}
  .mgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
  .mgrid .lbl{font-size:11px;letter-spacing:0;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:clip}
  ul.zl{grid-template-columns:1fr;}
}
`;

const page = (k, d) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PoP flags - ${d.name}</title>${d.head}<style>${css(d)}</style></head><body>
<header class="hdr"><div class="word"><img src="mimic-logo.png" alt="">Raid Mimic</div>
<nav class="nav"><a>Timers</a><a>Parses</a><a>Raid</a><a class="on">Characters</a><a>Mimic</a></nav>
<div class="right" style="display:flex;gap:8px;align-items:center"><div class="acct"><b>GL</b><span class="t">Guild lead</span></div><button class="menu" aria-label="Menu">&#9776;</button></div></header>
<div class="wrap">
<aside class="rail"><a>Overview</a><a class="on">Characters</a><a>Flags</a><a>Settings</a></aside>
<main class="main">
<div class="pills"><a>Overview</a><a>Characters</a><a class="on">Flags</a><a>Settings</a><a>History</a></div>
<div class="tb"><div><div class="eyebrow">On this PC</div><h1>PoP flags</h1><p class="desc">Planes of Power progress read from your characters' logs.</p></div>
<div class="acts"><button class="btn">Reload</button><button class="btn pri">Capture</button></div></div>
<div class="seg"><span class="on">Overall</span><span>Storms</span><span>Valor</span><span>Air</span><span>Time</span></div>
<div class="card"><div class="cardhd"><h2>Characters</h2><span class="chip g">5 found</span></div>
<table class="tbl-d"><thead><tr><th>Character</th><th class="r">Flags</th>${cols.map((c,i)=>`<th class="r">${c} ${max[i]}/${max[i]}</th>`).join('')}</tr></thead><tbody>${rowsDesktop}</tbody></table>
<div class="tbl-m">${rowsPhone}</div></div>
<div class="two">
<div class="card"><div class="cardhd"><h2>Needs next</h2><span class="chip o">Aldenmar</span></div><ul class="bul"><li>Time: 3 more flags to finish the line</li><li>Talk to the Keeper in the Plane of Time hall</li><li>Rethlan still needs Storms 1/3</li></ul></div>
<div class="card"><div class="cardhd"><h2>Can enter</h2><span class="chip y">Aldenmar</span></div><ul class="zl">${zonesHtml}</ul></div>
</div>
</main></div></body></html>`;

for (const k of Object.keys(dirs)) fs.writeFileSync(OUT + k + '.html', page(k, dirs[k]));

(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const res = [];
  for (const k of Object.keys(dirs)) for (const [w,h] of [[1280,900],[390,844]]) {
    const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
    const p = await ctx.newPage();
    await p.goto('file://' + OUT + k + '.html', { waitUntil: 'networkidle', timeout: 15000 }).catch(()=>{});
    await p.evaluate(() => document.fonts.ready);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    const fam = await p.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily + ' | ' + document.fonts.check('16px Prata'));
    await p.screenshot({ path: OUT + `${k}-${w}.png`, fullPage: true });
    res.push(`${k} ${w}: scrollWidth=${sw} h1=${fam}`);
    await ctx.close();
  }
  // comparison pages
  for (const w of [1280,390]) {
    const html = `<body style="margin:0;background:#000;display:flex;gap:16px;align-items:flex-start">${['a','b','c'].map(k=>`<img src="file://${OUT}${k}-${w}.png" style="width:${w}px">`).join('')}</body>`;
    const f = OUT + `cmp-${w}.html`; fs.writeFileSync(f, html);
    const ctx = await b.newContext({ viewport:{width:w*3+32,height:900}});
    const p = await ctx.newPage(); await p.goto('file://'+f);
    await p.screenshot({ path: OUT + `compare-${w}.png`, fullPage:true }); await ctx.close();
  }
  console.log(res.join('\n'));
  await b.close();
})();
