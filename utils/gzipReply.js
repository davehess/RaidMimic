// utils/gzipReply.js — answer a JSON body gzipped when the caller asked for it (the guild lead, 2026-11-16, hosting-sizes
// "gzip-now"). The bot moves ~36-41 GB out a week; /poll, raid-buff-queue and live-damage are the heavy repeaters.
// Only when `Accept-Encoding` names gzip, and not for a body under 1 KB (the header costs more than it saves). Anyone
// who did not ask gets the plain body, so an agent that predates gzip is untouched. `Vary` is always set so a cache
// never serves the compressed copy to a caller that cannot read it. None of these three routes carries an ETag.
const zlib = require('zlib');

const MIN_GZIP_BYTES = 1024;

function wantsGzip(req) {
  return /\bgzip\b/i.test(String((req && req.headers && req.headers['accept-encoding']) || ''));
}

function sendJson(req, res, status, body, headers) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const h = Object.assign({ 'Content-Type': 'application/json', 'Vary': 'Accept-Encoding' }, headers || {});
  if (wantsGzip(req) && buf.length >= MIN_GZIP_BYTES) {
    h['Content-Encoding'] = 'gzip';
    res.writeHead(status, h);
    return res.end(zlib.gzipSync(buf));
  }
  res.writeHead(status, h);
  return res.end(buf);
}

module.exports = { sendJson, wantsGzip, MIN_GZIP_BYTES };
