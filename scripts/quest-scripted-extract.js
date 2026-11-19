#!/usr/bin/env node
// Reads a checkout of the server's quest scripts (text only, nothing is executed) and writes
// the scripted spawns + scripted loot as JSON. Usage:
//   node scripts/quest-scripted-extract.js <quests-checkout-dir> <out.json>
// Output is the raw extraction (every call site); the DB classification and names are joined in
// afterwards (docs/AUDIT-quest-script-gaps-2026-11-19.md, "Method").
const fs = require('fs');
const path = require('path');

// --merge-into <quest-scripted.json>: write only the `rewards` section (and its notes) into that
// already-joined file instead of the raw dump, so the spawn/loot sections the audit joined stay as they are.
const argv = process.argv.slice(2);
const mergeAt = argv.indexOf('--merge-into');
const mergeInto = mergeAt >= 0 ? argv[mergeAt + 1] : null;
if (mergeAt >= 0) argv.splice(mergeAt, 2);
const root = argv[0];
const out = argv[1];
// optional 3rd arg: {zone_dir: {id}} so ids written in a script that fall in its own zone's npc range
// (zoneid*1000 .. +999) are listed as references (catches table-driven spawns the call scan cannot resolve)
const zones = argv[2] ? JSON.parse(fs.readFileSync(argv[2], 'utf8')) : {};
if (!root || !out) { console.error('usage: quest-scripted-extract.js <quests-dir> <out.json> [zones.json] [--merge-into quest-scripted.json]'); process.exit(2); }

function walk(dir, acc) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (n.name === '.git') continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walk(p, acc); else if (n.name.endsWith('.lua')) acc.push(p);
  }
  return acc;
}

// Blank out comments but keep every newline, so line numbers stay true.
function stripLua(src) {
  let s = src.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, m => m.replace(/[^\n]/g, ' '));
  let res = '';
  for (const line of s.split('\n')) {
    let inS = null, cut = -1;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inS) { if (c === '\\') i++; else if (c === inS) inS = null; }
      else if (c === '"' || c === "'") inS = c;
      else if (c === '-' && line[i + 1] === '-') { cut = i; break; }
    }
    res += (cut < 0 ? line : line.slice(0, cut)) + '\n';
  }
  return res.slice(0, -1);
}

function splitArgs(s) {
  const args = []; let depth = 0, cur = '', inS = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inS) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; cur += c; continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    if (c === ')' || c === '}' || c === ']') depth--;
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

// text between the "(" at index open and its matching ")"
function callBody(s, open) {
  let depth = 0, inS = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inS) { if (c === '\\') i++; else if (c === inS) inS = null; continue; }
    if (c === '"' || c === "'") { inS = c; continue; }
    if (c === '(') depth++;
    if (c === ')') { depth--; if (depth === 0) return s.slice(open + 1, i); }
  }
  return null;
}

const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;
const NUM = /^-?\d+(\.\d+)?$/;

function constantsOf(s) {
  // name -> [{line, value}] for simple numeric assignments, resolved by nearest preceding line
  const m = new Map();
  const add = (name, line, v) => { if (!m.has(name)) m.set(name, []); m.get(name).push({ line, v: Number(v) }); };
  const re1 = /(?:^|[\s;])(?:local\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*(?=[;\s]|$)/g;
  let x;
  while ((x = re1.exec(s))) add(x[1], lineOf(s, x.index + 1), x[2]);
  const re2 = /local\s+([A-Za-z_][\w\s,]*?)\s*=\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+)/g;
  while ((x = re2.exec(s))) {
    const names = x[1].split(',').map(t => t.trim()); const vals = x[2].split(',').map(t => t.trim());
    names.forEach((n, i) => { if (vals[i] !== undefined) add(n, lineOf(s, x.index), vals[i]); });
  }
  return m;
}
function resolve(expr, consts, line) {
  expr = expr.trim();
  if (NUM.test(expr)) return Number(expr);
  const list = consts.get(expr);
  if (!list) return null;
  let best = null;
  for (const c of list) if (c.line <= line) best = c;
  return best ? best.v : list[0].v;
}
function resolveIds(expr, consts, line) {
  const m = expr.match(/^eq\.ChooseRandom\(([\s\S]*)\)$/);
  if (m) {
    const ids = splitArgs(m[1]).map(a => resolve(a, consts, line));
    return ids.every(v => v !== null) ? { ids, choice: true } : { ids: null };
  }
  const v = resolve(expr, consts, line);
  return v === null ? { ids: null } : { ids: [v] };
}

function enclosing(lines, line) {
  for (let i = line - 1; i >= 0; i--) {
    const m = lines[i].match(/function\s+([A-Za-z_][\w.:]*)\s*\(/) || lines[i].match(/^\s*([A-Za-z_]\w*)\s*=\s*function\s*\(/);
    if (m) return m[1];
  }
  return null;
}

const files = walk(root, []).sort();
const spawns = [], loot = [], tables = [], refs = [], overrides = [];
// Turn-in rewards: `X:QuestReward(npc, copper, silver, gold, platinum, item, exp)` or `QuestReward(npc, {..})`,
// and `X:SummonCursorItem(id)`. Only literal ids/amounts are kept; the rest is counted in rewardNotes.
const rewards = [];
const rewardNotes = { calls: 0, computed_item: 0, computed_coin: 0, computed_exp: 0, turnin_items_not_literal: 0, no_turnin_found: 0, not_a_per_npc_file: 0 };
const COIN = ['copper', 'silver', 'gold', 'platinum'];
const litNum = (t) => { t = (t || '').trim(); return NUM.test(t) ? Number(t) : null; };
for (const f of files) {
  const rel = path.relative(root, f).split(path.sep).join('/');
  const zone = rel.split('/')[0];
  const raw = fs.readFileSync(f, 'utf8');
  const s = stripLua(raw);
  const rawLines = raw.split('\n');
  const lines = s.split('\n');
  const consts = constantsOf(s);

  if (zones[zone]) {
    const lo = zones[zone].id * 1000, seen = new Set();
    lines.forEach((ln, i) => { for (const n of ln.match(/\b\d{4,6}\b/g) || []) { const v = Number(n); if (v >= lo && v < lo + 1000 && !seen.has(v)) { seen.add(v); refs.push({ zone, script: rel + ':' + (i + 1), npc_id: v }); } } });
  }

  const reSp = /\beq\.(spawn2|unique_spawn)\s*\(/g;
  let m;
  while ((m = reSp.exec(s))) {
    const open = m.index + m[0].length - 1;
    const body = callBody(s, open); if (body === null) continue;
    const a = splitArgs(body); const line = lineOf(s, m.index);
    const r = resolveIds(a[0] || '', consts, line);
    const co = a.slice(3, 7);
    const num = co.map(t => (NUM.test(t) ? Number(t) : null));
    const rec = {
      zone, api: m[1], script: rel + ':' + line, fn: enclosing(lines, line),
      npc_expr: a[0] || null, grid: a[1] || null,
      x: num[0], y: num[1], z: num[2], heading: num[3],
      coords_expr: num.some(v => v === null) ? co.join(', ') : null,
      note: (rawLines[line - 1].match(/--\s*(.+)$/) || [])[1] || null,
    };
    if (r.ids) for (const id of r.ids) spawns.push({ ...rec, npc_id: id, choice_of: r.choice ? r.ids : null });
    else spawns.push({ ...rec, npc_id: null, choice_of: null });
  }

  // script-side respawn / condition overrides (args kept as written)
  const reT = /\beq\.(update_spawn_timer|spawn_condition)\s*\(/g;
  while ((m = reT.exec(s))) {
    const body = callBody(s, m.index + m[0].length - 1); if (body === null) continue;
    overrides.push({ zone, call: m[1], args: splitArgs(body).map(t => t.replace(/\s+/g, ' ')), script: rel + ':' + lineOf(s, m.index), fn: enclosing(lines, lineOf(s, m.index)) });
  }

  const reL = /(?:e\.self|[A-Za-z_]\w*(?::CastToNPC\(\))?):AddItem\s*\(/g;
  while ((m = reL.exec(s))) {
    const open = m.index + m[0].length - 1;
    const body = callBody(s, open); if (body === null) continue;
    const a = splitArgs(body); const line = lineOf(s, m.index);
    const id = resolve(a[0] || '', consts, line);
    loot.push({
      zone, script: rel + ':' + line, fn: enclosing(lines, line),
      target: m[0].replace(/:AddItem\s*\($/, ''), item_id: id, item_expr: id === null ? (a[0] || null) : null,
      note: (rawLines[line - 1].match(/--\s*(.+)$/) || [])[1] || null,
    });
  }

  // The script's own npc: <zone>/<name>.lua is a per-npc script (a bare number is the npc id itself).
  // Anything deeper (encounters/, items/) or a zone-level file names no single npc.
  const rparts = rel.split('/');
  const rbase = rparts[rparts.length - 1].replace(/\.lua$/i, '');
  const perNpc = rparts.length === 2 && !/^(player|global_npc|global_player|script_init|zone|init)$/i.test(rbase);
  const fileNpc = !perNpc ? { id: null, name: null }
    : /^\d+$/.test(rbase) ? { id: Number(rbase), name: null }
    : { id: null, name: rbase.replace(/^#/, '').replace(/_/g, ' ') };

  // `check_turn_in(e.self, e.trade, {item1 = N, item2 = N})` calls, so each reward can say what hands it out
  const turnins = [];
  const reTi = /\bcheck_turn_in\s*\(/g;
  while ((m = reTi.exec(s))) {
    const body = callBody(s, m.index + m[0].length - 1); if (body === null) continue;
    const line = lineOf(s, m.index);
    const items = new Map(); let literal = true;
    for (const it of body.matchAll(/\bitem\d+\s*=\s*([^,}\s]+)/g)) {
      const v = resolve(it[1], consts, line);
      if (v === null) literal = false; else if (v > 0) items.set(v, (items.get(v) || 0) + 1);
    }
    turnins.push({ line, fn: enclosing(lines, line), items: [...items].map(([item_id, qty]) => ({ item_id, qty })), literal });
  }

  const reQ = /\b(?:\w+[:.])?(QuestReward|SummonCursorItem)\s*\(/g;
  while ((m = reQ.exec(s))) {
    const body = callBody(s, m.index + m[0].length - 1); if (body === null) continue;
    const a = splitArgs(body); const line = lineOf(s, m.index);
    rewardNotes.calls++;
    const rec = { zone, npc_id: fileNpc.id, npc_name: fileNpc.name, kind: m[1] === 'QuestReward' ? 'reward' : 'cursor',
                  item_ids: [], choice_of: null, exp: null, coin: null, script: rel + ':' + line, gives_for: null };
    let itemExpr = null, expExpr = null; const coinExpr = {};
    if (m[1] === 'SummonCursorItem') itemExpr = a[0];
    else if ((a[1] || '').trim().startsWith('{')) {
      const inner = a[1].trim().replace(/^\{/, '').replace(/\}$/, '');
      for (const kv of splitArgs(inner)) {
        const eq = kv.match(/^\s*(\w+)\s*=\s*([\s\S]*)$/); if (!eq) continue;
        const [, k, v] = eq;
        if (COIN.includes(k)) coinExpr[k] = v; else if (k === 'exp') expExpr = v;
        else if (k === 'itemid') itemExpr = v;
        else if (k === 'items') { const ids = splitArgs(v.trim().replace(/^\{/, '').replace(/\}$/, '')).map(t => resolve(t, consts, line));
          if (ids.length && ids.every(x => x !== null)) { rec.item_ids = ids; } else rewardNotes.computed_item++; }
      }
    } else {
      COIN.forEach((k, i) => { if (a[i + 1] !== undefined) coinExpr[k] = a[i + 1]; });
      itemExpr = a[5]; expExpr = a[6];
    }
    if (itemExpr && itemExpr.trim() !== '0') {
      const r = resolveIds(itemExpr.trim(), consts, line);
      if (r.ids) { rec.item_ids = r.ids.filter(v => v > 0); rec.choice_of = r.choice ? rec.item_ids : null; } else rewardNotes.computed_item++;
    }
    if (expExpr != null && expExpr.trim() !== '0') { const v = litNum(expExpr); if (v === null) rewardNotes.computed_exp++; else rec.exp = v; }
    for (const k of COIN) {
      if (coinExpr[k] === undefined || coinExpr[k].trim() === '0') continue;
      const v = litNum(coinExpr[k]);
      if (v === null) rewardNotes.computed_coin++; else (rec.coin = rec.coin || {})[k] = v;
    }
    if (!perNpc) rewardNotes.not_a_per_npc_file++;
    const fn = enclosing(lines, line);
    let ti = null;
    for (const t of turnins) if (t.fn === fn && t.line <= line && line - t.line <= 80) ti = t;
    if (ti) { if (!ti.literal) rewardNotes.turnin_items_not_literal++; rec.gives_for = ti.items; } else rewardNotes.no_turnin_found++;
    if (rec.item_ids.length || rec.exp !== null || rec.coin) rewards.push(rec);
  }

  // table-driven loot: a file whose AddItem argument is a lookup ([npc] = item or [npc] = { item, count })
  if (loot.some(l => l.script.startsWith(rel + ':') && l.item_id === null && /^[A-Za-z_]\w*(\[|$)/.test(l.item_expr || ''))) {
    let tbl = null;
    lines.forEach((ln, i) => {
      const t = ln.match(/^local\s+(\w+)\s*=\s*\{\s*$/); if (t) tbl = t[1];
      const rePair = /\[(\d+)\]\s*=\s*(?:(\d+)|\{\s*(\d+)\s*,\s*(\d+)\s*\})/g; let p;
      while ((p = rePair.exec(ln))) {
        tables.push({ zone, file: rel, table: tbl, line: i + 1, npc_id: Number(p[1]), item_id: Number(p[2] || p[3]), count: p[4] ? Number(p[4]) : null });
      }
    });
  }
}
if (mergeInto) {
  const d = JSON.parse(fs.readFileSync(mergeInto, 'utf8'));
  d.rewards = rewards;
  const note = 'rewards: literal ids and amounts only. Not literal (counted, not listed): '
    + `${rewardNotes.computed_item} item args, ${rewardNotes.computed_coin} coin args, ${rewardNotes.computed_exp} exp args. `
    + `${rewardNotes.no_turnin_found} of ${rewardNotes.calls} calls have no check_turn_in earlier in the same handler (gives_for null); `
    + `${rewardNotes.turnin_items_not_literal} turn-in checks carry a non-literal item. `
    + `${rewardNotes.not_a_per_npc_file} calls sit in a file that names no single npc (encounters/, items/, zone-level). `
    + 'gives_for is the nearest check_turn_in above the call in the same function, not a proof the reward needs exactly that hand-in.';
  d.notes = (d.notes || []).filter(n => !String(n).startsWith('rewards:')).concat(note);
  // Same layout the file already has: one array element per line, objects compact.
  const body = Object.entries(d).map(([k, v]) => Array.isArray(v)
    ? `  ${JSON.stringify(k)}: [\n${v.map(x => '    ' + JSON.stringify(x)).join(',\n')}\n  ]`
    : `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  fs.writeFileSync(mergeInto, `{\n${body}\n}\n`);
} else {
  fs.writeFileSync(out, JSON.stringify({ files: files.length, spawns, loot, tables, refs, overrides, rewards, rewardNotes }));
}
console.error('files', files.length, 'spawn calls', spawns.length, 'loot calls', loot.length, 'rewards', rewards.length, JSON.stringify(rewardNotes));
