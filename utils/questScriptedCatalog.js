// utils/questScriptedCatalog.js — serves data/quest-scripted.json (what the server's quest scripts spawn and drop
// that the eqemu_* mirror cannot show; docs/AUDIT-quest-script-gaps-2026-11-19.md) as the public catalog
// `quest-scripted`, so Mimic installers can bundle it and local installs can refresh it.
//
// Same envelope as the other catalogs ({version, fetched_at, count, entries}) with `entries` = the scripted
// spawns, plus the dataset's other sections beside it. Read with readJsonFresh (never the require cache), held
// in memory until the file's mtime changes, strong ETag over the exact bytes, 304 on If-None-Match.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readJsonFresh = require('./readJsonFresh');

const FILE = path.join(__dirname, '..', 'data', 'quest-scripted.json');
let _cache = null;

function load(file = FILE) {
  const st = fs.statSync(file);
  if (_cache && _cache.file === file && _cache.mtimeMs === st.mtimeMs) return _cache;
  const d = readJsonFresh(file);
  const body = JSON.stringify({
    version: 1,
    // The dataset's own read date, not the file's mtime: a Docker build resets mtime, so every deploy would
    // change the ETag and make every Mimic re-download ~0.9 MB of unchanged data.
    fetched_at: (d.source && d.source.read_at) ? new Date(d.source.read_at).toISOString() : st.mtime.toISOString(),
    count: d.spawns.length,
    entries: d.spawns,
    script_refs: d.script_refs || [],
    loot: d.loot || [],
    timer_overrides: d.timer_overrides || [],
    source: d.source,
    notes: d.notes,
  });
  const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
  _cache = { file, mtimeMs: st.mtimeMs, body, etag };
  return _cache;
}

function handle(req, res, file) {
  let c;
  try { c = load(file); }
  catch (err) {
    console.log('[quest-scripted] unavailable:', err && err.message);
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '300' });
    return res.end(JSON.stringify({ error: 'quest-scripted unavailable' }));
  }
  if (req.headers['if-none-match'] === c.etag) {
    res.writeHead(304, { ETag: c.etag, 'Cache-Control': 'max-age=43200' });
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'application/json', ETag: c.etag, 'Cache-Control': 'max-age=43200' });
  return res.end(c.body);
}

module.exports = { handle, load };
