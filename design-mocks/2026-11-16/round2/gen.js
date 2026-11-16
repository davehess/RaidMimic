const fs=require('fs');const D=__dirname;
// contrast
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const cr=(a,b)=>{const x=lum(a),y=lum(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*t+parseInt(b.slice(i,i+2),16)*(1-t)).toString(16).padStart(2,'0')).join('');
const P='#161b22',B='#0d1117';
const selBg=mix('#1f6feb',P,.12);
const pairs=[['text c9d1d9/panel','#c9d1d9',P],['mute 9aa4ad/panel (th, secondary)','#9aa4ad',P],['mute 9aa4ad/bg','#9aa4ad',B],['mute on selected-row tint','#9aa4ad',selBg],['link 58a6ff/panel','#58a6ff',P],['link 58a6ff/selected tint','#58a6ff',selBg],['white/accent button 1f6feb','#ffffff','#1f6feb'],['green 56d364/panel','#56d364',P],['gold d29922/panel','#d29922',P],['red ff7b72 on red chip tint','#ff7b72',mix('#f85149',P,.16)],['green on green chip tint','#56d364',mix('#56d364',P,.16)],['faint zero 6b7580/panel (intentionally dim)','#6b7580',P],['text on raised 21262d (button)','#c9d1d9','#21262d']];
const rep=pairs.map(([n,f,b])=>n+' = '+cr(f,b)+':1');
fs.writeFileSync(D+'/contrast.txt',rep.join('\n'));console.log(rep.join('\n'));

const COLS=[['Storms',3],['Valor',3],['Sol Ro',6],['Air',5],['Time',5]];
const CH=[['Aldenmar',65,19,[3,3,6,3,4]],['Brackwyn',65,14,[3,3,4,2,2]],['Corvale',62,4,[3,1,0,0,0]],['Rethlan',60,2,[2,0,0,0,0]],['Nyssara',58,0,[0,0,0,0,0]]];
const cell=(x,n)=>`<span class="c ${x===n?'done':x?'part':'zero'}">${x}/${n}</span>`;
const bar=(x,n=22)=>`<span class="bar"><i class="${x===n?'full':''}" style="width:${x/n*100}%"></i></span>`;
const flags=c=>`<span class="fl"><b class="n">${c[2]}/22</b>${bar(c[2])}</span>`;

const CSS=`
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#c9d1d9;--mute:#9aa4ad;--faint:#6b7580;--accent:#1f6feb;--blue:#58a6ff;--green:#56d364;--red:#f85149;--gold:#d29922;--raised:#21262d;--sel:${selBg};
--f:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box;margin:0}html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font:400 14px/1.45 var(--f);font-variant-numeric:tabular-nums;min-height:100vh;overflow-x:hidden}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.hdr{border-bottom:1px solid var(--border);background:var(--panel);display:flex;align-items:center;gap:24px;padding:0 24px;min-height:52px;flex-wrap:wrap}
.word{font-size:16px;font-weight:700;display:flex;align-items:center;gap:10px;height:52px}
.word img{width:28px;height:28px;border-radius:6px}
.nav{display:flex;gap:4px;flex:1;overflow-x:auto}
.nav a{color:var(--mute);padding:6px 12px;border-radius:4px;white-space:nowrap}
.nav a.on{color:var(--text);background:var(--raised)}
.acct{display:flex;align-items:center;gap:8px;background:var(--raised);border:1px solid var(--border);border-radius:999px;padding:3px 12px 3px 4px;height:32px;font-size:13px}
.acct b{width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;display:grid;place-items:center}
.page{max-width:1400px;margin:0 auto;padding:24px}
.tb{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
h1{font-size:24px;font-weight:650;line-height:1.2;color:var(--text);margin-bottom:4px}
.desc{color:var(--mute)}
.acts{display:flex;gap:8px}
.btn{font:600 14px/1 var(--f);min-height:36px;padding:0 16px;border-radius:6px;border:1px solid var(--border);background:var(--raised);color:var(--text);cursor:pointer}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px}
table{width:100%;border-collapse:collapse}
th{font-size:12px;font-weight:600;color:var(--mute);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:11px 14px;border-bottom:1px solid var(--border);white-space:nowrap}
.r{text-align:right}
th .car{color:var(--blue);margin-left:4px}
tr.row{cursor:pointer}tr.row:hover td{background:#1b2129}
tr.sel td{background:var(--sel)}tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.name{font-weight:600}
.c{font-weight:600}.c.done,.done{color:var(--green)}.c.part{color:var(--gold)}.c.zero{color:var(--faint);font-weight:400}
.fl{display:inline-flex;align-items:center;gap:10px}.fl .n{min-width:44px;font-weight:600}
.n.done{color:var(--green)}
.bar{display:inline-block;width:72px;height:6px;border-radius:3px;background:#2b323b;overflow:hidden}
.bar i{display:block;height:100%;background:var(--green);border-radius:3px}
.sec h3{font-size:12px;font-weight:600;color:var(--mute);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.needs{list-style:none;padding:0;display:grid;gap:4px}
.needs a{display:block;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg)}
.needs a:hover{background:var(--raised);text-decoration:none}
.needs a:after{content:" \\2192"}
.needs b{color:var(--text);font-weight:600}
.enter{list-style:none;padding:0;display:grid;gap:2px}
.enter li{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)}
.enter li:last-child{border:0}
.enter .z{min-width:84px;font-weight:600}
.chip{width:24px;height:22px;border-radius:5px;display:grid;place-items:center;font-size:13px;font-weight:700;flex:none}
.chip.y{background:rgba(86,211,100,.16);color:var(--green)}
.chip.x{background:rgba(248,81,73,.16);color:#ff7b72}
.req{color:#ff7b72;font-size:13px}
.det{display:grid;gap:24px}
.cards{display:none}
.ccard{padding:14px;border-bottom:1px solid var(--border)}
.ccard.sel{background:var(--sel);box-shadow:inset 3px 0 0 var(--accent)}
.ccard .top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ccard .lv{color:var(--mute);margin-left:8px;font-weight:400}
.ccard .mini{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}
.ccard .mini div{font-size:12px;color:var(--mute)}.ccard .mini .c{display:block;font-size:14px}
.ccard .det{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
`;
const head=(t,extraCss='')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title><style>${CSS}${extraCss}</style></head><body>
<header class="hdr"><div class="word"><img src="mimic-logo.png" alt="">Raid Mimic</div><nav class="nav"><a>Timers</a><a>Parses</a><a>Raid</a><a class="on">Characters</a><a>Mimic</a></nav><div class="acct"><b>A</b>Aldenmar</div></header>
<div class="page"><div class="tb"><div><h1>Planes of Power flags</h1><div class="desc">Progress across your characters, from the last snapshot.</div></div><div class="acts"><button class="btn">Reload</button><button class="btn pri">Capture snapshot</button></div></div>`;
const foot='</div></body></html>';
const needs=`<ul class="needs"><li><a href="#time"><b>Time:</b> hail the Keeper in the Plane of Time hall</a></li><li><a href="#air"><b>Air:</b> kill the four Avatars (2 left)</a></li><li><a href="#fire"><b>Fire:</b> kill Fennin Ro</a></li></ul>`;
const ENT=[['Valor',1],['Torment',1],['Tactics',1],['Sol Ro',1],['Air',1],['Water',1],['Earth',0,'needs Arbitor'],['Fire',1],['Time',0,'needs the four essences']];
const enter=`<ul class="enter">${ENT.map(([z,ok,r])=>`<li><span class="z">${z}</span><span class="chip ${ok?'y':'x'}" aria-label="${ok?'can enter':'cannot enter'}">${ok?'✓':'✗'}</span>${r?`<span class="req">${r}</span>`:''}</li>`).join('')}</ul>`;
const detail=`<div class="det"><div class="sec"><h3>Needs next</h3>${needs}</div><div class="sec"><h3>Can enter</h3>${enter}</div></div>`;
const thead=`<tr><th>Character</th><th class="r">Lvl <span class="car">▾</span></th><th>Flags</th>${COLS.map(c=>`<th>${c[0]}</th>`).join('')}</tr>`;
const trow=(c,i,cls='')=>`<tr class="row ${i===0?'sel':''} ${cls}" data-i="${i}"><td class="name">${c[0]}</td><td class="r">${c[1]}</td><td>${flags(c)}</td>${c[3].map((x,k)=>`<td>${cell(x,COLS[k][1])}</td>`).join('')}</tr>`;
const ccard=(c,i,open,sheet)=>`<div class="ccard ${i===0?'sel':''}" data-i="${i}"><div class="top"><span class="name">${c[0]}<span class="lv">Lvl ${c[1]}</span></span>${flags(c)}</div><div class="mini">${c[3].map((x,k)=>`<div>${COLS[k][0]}${cell(x,COLS[k][1])}</div>`).join('')}</div>${open&&i===0?detail:''}</div>`;

// d1
const d1=head('PoP flags - d1 Dense table',`
@media(max-width:760px){.tbl{display:none}.cards{display:block}.page{padding:16px}.hdr{padding:0 16px;gap:8px}.nav{order:3;flex-basis:100%}.word{height:48px}.tb{align-items:stretch}.acts{width:100%}.acts .btn{flex:1}}
.xrow>td{padding:0;background:var(--bg);white-space:normal}
.xin{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:20px 20px 20px 24px;box-shadow:inset 3px 0 0 var(--accent)}
.xin .det{display:contents}`)+
`<div class="card tbl"><table><thead>${thead}</thead><tbody>${CH.map((c,i)=>trow(c,i)+(i===0?`<tr class="xrow"><td colspan="8"><div class="xin">${detail}</div></td></tr>`:'')).join('')}</tbody></table></div>
<div class="card cards">${CH.map((c,i)=>ccard(c,i,true)).join('')}</div>
<script>document.querySelectorAll('.ccard').forEach(c=>c.onclick=()=>{});</script>`+foot;

// d2
const d2=head('PoP flags - d2 Two panes',`
.split{display:grid;grid-template-columns:3fr 2fr;gap:24px;align-items:start}
.pane{position:sticky;top:16px;padding:20px}
.ph{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px}
.ph h2{font-size:20px;font-weight:650}.ph .lv{color:var(--mute);margin-top:2px}
.pbar{margin:14px 0 22px}.pbar .row{display:flex;justify-content:space-between;margin-bottom:6px;font-weight:600}
.pbar .bar{width:100%;height:8px}
.sheet{display:none}
@media(max-width:860px){.split{display:block}.pane{display:none}.page{padding:16px}.hdr{padding:0 16px;gap:8px}.nav{order:3;flex-basis:100%}.word{height:48px}.tbl{display:none}.cards{display:block}.acts{width:100%}.acts .btn{flex:1}.tb{align-items:stretch}
.sheet{display:block;position:fixed;inset:0;background:var(--bg);z-index:5;overflow-y:auto}
.sh{position:sticky;top:0;background:var(--panel);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;padding:0 8px;height:52px}
.sh button{background:none;border:0;color:var(--blue);font:600 15px var(--f);min-width:44px;min-height:44px;display:flex;align-items:center;gap:6px;cursor:pointer}
.sb{padding:20px 16px}}`)+
`<div class="split"><div class="card tbl"><table><thead>${thead}</thead><tbody>${CH.map((c,i)=>trow(c,i)).join('')}</tbody></table></div>
<div class="card cards">${CH.map((c,i)=>ccard(c,i,false)).join('')}</div>
<aside class="card pane"><div class="ph"><div><h2>Aldenmar</h2><div class="lv">Level 65</div></div></div><div class="pbar"><div class="row"><span>Flags</span><span>19 of 22</span></div>${bar(19)}</div>${detail}</aside></div>
<div class="sheet"><div class="sh"><button aria-label="Back to characters">← Characters</button></div><div class="sb"><div class="ph"><div><h2>Aldenmar</h2><div class="lv">Level 65</div></div></div><div class="pbar"><div class="row"><span>Flags</span><span>19 of 22</span></div>${bar(19)}</div>${detail}</div></div>`+foot;

// d3
const N=(n,s,t,call)=>`<div class="node ${s}">${call?'<a id="'+call[0]+'"></a>':''}<div class="dot">${t||(s==='done'?'✓':'')}</div><div class="nm">${n}</div>${call?`<a class="call" href="#">${call[1]} →</a>`:''}</div>`;
const tiers=[
['Tier 1',[N('Justice','done'),N('Innovation','done'),N('Disease','done'),N('Nightmare','done')]],
['Tier 2',[N('Storms','done','3/3'),N('Valor','done','3/3'),N('Decay','done'),N('T. Thule','done'),N('Torment','done')]],
['Tier 3',[N('Thunder','done'),N('Honor','done'),N('Tactics','done'),N('Sol Ro','done','6/6')]],
['Elemental',[N('Earth','locked').replace('</div></div>','</div><div class="locknote">needs Arbitor</div></div>'),N('Air','part','3/5',['air','Kill the four Avatars (2 left)']),N('Water','done'),N('Fire','part','•',['fire','Kill Fennin Ro'])]],
['Time',[N('Time','part','4/5',['time','Hail the Keeper in the Plane of Time hall'])]]];
const d3=head('PoP flags - d3 Tier ladder',`
.lay{display:grid;grid-template-columns:260px 1fr;gap:24px;align-items:start}
.sw{padding:6px}.sw .it{color:var(--text);display:block;padding:10px 12px;border-radius:6px;border-left:3px solid transparent}
.sw .it.sel{background:var(--sel);border-left-color:var(--accent)}
.sw .t{display:flex;justify-content:space-between;margin-bottom:6px}.sw .bar{width:100%}
.chips{display:none}
.lad{padding:20px 24px}
.lh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:18px}.lh h2{font-size:20px;font-weight:650}.lh span{color:var(--mute)}
.tier{display:grid;grid-template-columns:96px 1fr;gap:16px;position:relative;padding-bottom:30px}
.tier:last-child{padding-bottom:0}
.tier:not(:last-child):after{content:"";position:absolute;left:104px;top:34px;bottom:-2px;width:0;border-left:2px solid #3a424c;display:none}
.tl{color:var(--mute);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding-top:12px}
.nodes{display:flex;gap:16px;flex-wrap:wrap;position:relative}
.tier:not(:last-child) .nodes:after{content:"";position:absolute;left:28px;top:100%;height:30px;border-left:2px solid #3a424c}
.tier:not(:last-child) .nodes{margin-bottom:0}
.node{flex:1 1 0;min-width:130px;max-width:200px;border:1px solid var(--border);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;background:var(--bg)}
.dot{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:13px}
.done .dot{background:var(--green);color:#0d1117}.part .dot{border:2px solid var(--gold);color:var(--gold)}.locked .dot{border:2px dashed #4b535d;color:var(--faint)}
.nm{font-weight:600}.locked .nm{color:var(--faint)}
.part{border-color:rgba(210,153,34,.5)}
.call{font-size:13px;line-height:1.35}
.locknote{color:#ff7b72;font-size:13px}
@media(max-width:860px){.lay{display:block}.sw{display:none}.chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:12px}
.chip2{color:var(--text);flex:none;padding:8px 12px;border:1px solid var(--border);border-radius:999px;background:var(--panel);display:flex;gap:8px;align-items:center;min-height:40px}.chip2.sel{border-color:var(--accent);background:var(--sel)}.chip2 .n{color:var(--mute);font-size:13px}
.page{padding:16px}.hdr{padding:0 16px;gap:8px}.nav{order:3;flex-basis:100%}.word{height:48px}.acts{width:100%}.acts .btn{flex:1}.tb{align-items:stretch}
.lad{padding:16px}.tier{grid-template-columns:1fr;gap:6px;padding-bottom:26px}.tl{padding-top:0}.nodes{gap:10px}.node{flex:none;width:calc(50% - 5px);max-width:none;min-width:0}.tier:not(:last-child) .nodes:after{left:18px;height:26px}}`)+
`<div class="lay"><aside class="card sw">${CH.map((c,i)=>`<a class="it ${i===0?'sel':''}" href="#"><div class="t"><span class="name">${c[0]}</span><span class="lv" style="color:var(--mute)">Lvl ${c[1]}</span></div><span class="fl" style="display:flex"><b class="n ${c[2]===22?'done':''}" style="min-width:44px">${c[2]}/22</b>${bar(c[2]).replace('width:72px','')}</span></a>`).join('')}</aside>
<div><div class="chips">${CH.map((c,i)=>`<a class="chip2 ${i===0?'sel':''}"><span class="name">${c[0]}</span><span class="n">${c[2]}/22</span></a>`).join('')}</div>
<div class="card lad"><div class="lh"><h2>Aldenmar</h2><span>Level 65 · 19 of 22 flags</span></div>${tiers.map(([l,n])=>`<div class="tier"><div class="tl">${l}</div><div class="nodes">${n.join('')}</div></div>`).join('')}</div></div></div>`+foot;
d3.replace;
fs.writeFileSync(D+'/d1.html',d1);fs.writeFileSync(D+'/d2.html',d2);fs.writeFileSync(D+'/d3.html',d3.replace('.sw .bar{width:100%}','.sw .fl{width:100%}.sw .bar{flex:1;width:auto}'));
