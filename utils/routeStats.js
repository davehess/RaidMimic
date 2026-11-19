// utils/routeStats.js — data out by route, in memory only (the guild lead, 2026-11-18, platform-admin Desk card).
// Per normalised route: request count + response bytes over a rolling 24 h, in hourly buckets (24 kept). No database
// writes; a redeploy starts the window again, and the report says since when it has been collecting (`since`).
// Bytes are what is handed to res.write/res.end, so a gzipped reply counts its compressed size (utils/gzipReply.js),
// which is what leaves the box. Headers are not counted.

const HOUR_MS = 3600 * 1000;
const KEEP_HOURS = 24;
const MAX_KEYS = 200;          // distinct route keys across the window; the rest fold into OTHER_KEY
const OTHER_KEY = '(other)';

// buckets: Map<hourIndex, Map<routeKey, { n, bytes }>>
const _buckets = new Map();
const _keys = new Set();
let _startedAt = Date.now();

const _UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function _isIdSegment(s) {
  if (!s) return false;
  if (/^\d+$/.test(s)) return true;                 // 12345
  if (_UUID.test(s)) return true;
  if (/^[0-9a-f]{12,}$/i.test(s)) return true;      // long hex
  if (/^wpms_/.test(s)) return true;                // session tokens
  if (s.length >= 20 && /\d/.test(s)) return true;  // opaque ids / slugs with digits
  return false;
}

// "GET /api/agent/target-buffs/123?x=1" -> "GET /api/agent/target-buffs/:id"
function normalizeRoute(method, url) {
  let p = String(url || '/').split('?')[0].split('#')[0] || '/';
  p = p.split('/').map(seg => (_isIdSegment(seg) ? ':id' : seg.slice(0, 40))).join('/');
  if (p.length > 120) p = p.slice(0, 120);
  return `${String(method || 'GET').toUpperCase()} ${p}`;
}

function _prune(hour) {
  for (const h of _buckets.keys()) if (h <= hour - KEEP_HOURS) _buckets.delete(h);
  // Keys that have aged out of every bucket free their slot.
  const live = new Set();
  for (const b of _buckets.values()) for (const k of b.keys()) live.add(k);
  for (const k of _keys) if (!live.has(k)) _keys.delete(k);
}

function record(method, url, bytes, now = Date.now()) {
  const hour = Math.floor(now / HOUR_MS);
  let b = _buckets.get(hour);
  if (!b) { b = new Map(); _buckets.set(hour, b); _prune(hour); }
  let key = normalizeRoute(method, url);
  if (!_keys.has(key)) {
    if (_keys.size >= MAX_KEYS) key = OTHER_KEY;
    else _keys.add(key);
  }
  const e = b.get(key) || { n: 0, bytes: 0 };
  e.n += 1;
  e.bytes += Math.max(0, Number(bytes) || 0);
  b.set(key, e);
}

// Wrap res.write/res.end once, record on close. Safe to call for every request.
function instrument(req, res, now = () => Date.now()) {
  let bytes = 0;
  const count = (chunk, enc) => {
    if (chunk == null || typeof chunk === 'function') return;
    try { bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), typeof enc === 'string' ? enc : 'utf8'); }
    catch { /* never break a reply for a counter */ }
  };
  const w = res.write, e = res.end;
  res.write = function (chunk, enc) { count(chunk, enc); return w.apply(this, arguments); };
  res.end = function (chunk, enc) { count(chunk, enc); return e.apply(this, arguments); };
  let done = false;
  res.on('close', () => {
    if (done) return;
    done = true;
    try { record(req.method, req.url, bytes, now()); } catch { /* counter only */ }
  });
}

function report(now = Date.now()) {
  const hour = Math.floor(now / HOUR_MS);
  const agg = new Map();
  for (const [h, b] of _buckets) {
    if (h <= hour - KEEP_HOURS) continue;
    for (const [k, v] of b) {
      const a = agg.get(k) || { route: k, requests: 0, bytes: 0 };
      a.requests += v.n; a.bytes += v.bytes;
      agg.set(k, a);
    }
  }
  const routes = [...agg.values()].sort((x, y) => y.bytes - x.bytes);
  const totalBytes = routes.reduce((s, r) => s + r.bytes, 0);
  const totalRequests = routes.reduce((s, r) => s + r.requests, 0);
  return { window_hours: KEEP_HOURS, since: new Date(_startedAt).toISOString(), total_bytes: totalBytes, total_requests: totalRequests, routes };
}

function _reset() { _buckets.clear(); _keys.clear(); _startedAt = Date.now(); }

module.exports = { record, instrument, report, normalizeRoute, _reset, MAX_KEYS, OTHER_KEY, KEEP_HOURS, HOUR_MS };
