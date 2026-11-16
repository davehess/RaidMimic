// test/gzip-reply.test.js — the three heavy agent routes gzip only for callers that ask (hosting-sizes "gzip-now").
// Run: npx vitest run test/gzip-reply.test.js
import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { BOT_INDEX, stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const { sendJson, MIN_GZIP_BYTES } = require('../utils/gzipReply.js');

function call(acceptEncoding, body, headers) {
  const req = { headers: acceptEncoding == null ? {} : { 'accept-encoding': acceptEncoding } };
  const out = {};
  const res = { writeHead(s, h) { out.status = s; out.headers = h; }, end(b) { out.body = b; } };
  sendJson(req, res, 200, body, headers);
  return out;
}

const BIG = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => ({ n: 'player' + i, dmg: i * 1000 })) });

describe('gzipReply.sendJson', () => {
  it('gzips a large body when the caller asks, and the bytes round-trip', () => {
    const r = call('gzip, deflate, br', BIG);
    expect(r.headers['Content-Encoding']).toBe('gzip');
    expect(r.headers['Vary']).toBe('Accept-Encoding');
    expect(r.body.length).toBeLessThan(BIG.length);
    expect(zlib.gunzipSync(r.body).toString('utf8')).toBe(BIG);
  });

  it('sends the plain body when gzip was not asked for', () => {
    for (const ae of [null, '', 'identity', 'br']) {
      const r = call(ae, BIG);
      expect(r.headers['Content-Encoding']).toBeUndefined();
      expect(r.headers['Vary']).toBe('Accept-Encoding');
      expect(r.body.toString('utf8')).toBe(BIG);
    }
  });

  it('skips a body under 1 KB even when asked', () => {
    const small = JSON.stringify({ players: [] });
    expect(small.length).toBeLessThan(MIN_GZIP_BYTES);
    const r = call('gzip', small);
    expect(r.headers['Content-Encoding']).toBeUndefined();
    expect(r.body.toString('utf8')).toBe(small);
  });

  it('keeps the caller headers (Cache-Control) and ETag-free routes stay ETag-free', () => {
    const r = call('gzip', BIG, { 'Cache-Control': 'no-store' });
    expect(r.headers['Cache-Control']).toBe('no-store');
    expect(r.headers['Content-Type']).toBe('application/json');
    expect(r.headers['ETag']).toBeUndefined();
  });

  it('a caller ETag header passes through untouched (the 304 path never reaches the helper)', () => {
    const r = call('gzip', BIG, { 'ETag': '"abc"' });
    expect(r.headers['ETag']).toBe('"abc"');
  });
});

describe('the three heavy routes use it', () => {
  const code = stripJs(fs.readFileSync(BOT_INDEX, 'utf8'));
  it('poll, raid-buff-queue and live-damage answer through gzipReply.sendJson', () => {
    expect((code.match(/gzipReply'\)\.sendJson\(/g) || []).length).toBe(3);
    expect(code).toMatch(/gzipReply'\)\.sendJson\(req, res, 200, out\.body\)/);
    expect(code).toMatch(/gzipReply'\)\.sendJson\(req, res, 200, JSON\.stringify\(out\), \{ 'Cache-Control': 'no-store' \}\)/);
  });
});
