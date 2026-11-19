#!/usr/bin/env node
// Reads a checkout of the server's quest scripts (text only, nothing is executed) and writes
// the scripted spawns + scripted loot as JSON. Usage:
//   node scripts/quest-scripted-extract.js <quests-checkout-dir> <out.json>
// Output is the raw extraction (every call site); the DB classification and names are joined in
// afterwards (docs/AUDIT-quest-script-gaps-2026-11-19.md, "Method").
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const out = process.argv[3];
// optional 3rd arg: {zone_dir: {id}} so ids written in a script that fall in its own zone's npc range
// (zoneid*1000 .. +999) are listed as references (catches table-driven spawns the call scan cannot resolve)
const zones = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : {};
if (!root || !out) { console.error('usage: quest-scripted-extract.js <quests-dir> <out.json>'); process.exit(2); }

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
fs.writeFileSync(out, JSON.stringify({ files: files.length, spawns, loot, tables, refs, overrides }));
console.error('files', files.length, 'spawn calls', spawns.length, 'loot calls', loot.length);
