// The public `quest-scripted` catalog route: serves data/quest-scripted.json with a strong ETag, 304 on a match.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripJs } from './_source-slice.js';

const require = createRequire(import.meta.url);
const { handle } = require('../utils/questScriptedCatalog');
const rel = (p) => fileURLToPath(new URL(p, import.meta.url));

function get(port, headers) {
  return new Promise((resolve, reject) => {
    http.get({ port, path: '/', headers }, (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: b }));
    }).on('error', reject);
  });
}

describe('quest-scripted catalog route', () => {
  it('serves the dataset with an ETag and answers 304 to a match', async () => {
    const srv = http.createServer((req, res) => handle(req, res)).listen(0);
    try {
      const port = srv.address().port;
      const a = await get(port, {});
      expect(a.status).toBe(200);
      expect(a.headers.etag).toMatch(/^"[0-9a-f]{40}"$/);
      const j = JSON.parse(a.body);
      const d = JSON.parse(readFileSync(rel('../data/quest-scripted.json'), 'utf8'));
      expect(j.entries.length).toBe(d.spawns.length);
      expect(j.entries.length).toBeGreaterThan(1000);
      expect(j.loot.length).toBe(d.loot.length);
      const b = await get(port, { 'if-none-match': a.headers.etag });
      expect(b.status).toBe(304);
      expect(b.body).toBe('');
      expect((await get(port, { 'if-none-match': '"other"' })).status).toBe(200);
    } finally { srv.close(); }
  });

  it('a new file mtime (every Docker build) does not change the ETag when the data is the same', () => {
    const { load } = require('../utils/questScriptedCatalog');
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-'));
    const f = path.join(dir, 'quest-scripted.json');
    fs.writeFileSync(f, JSON.stringify({ source: { read_at: '2026-11-19' }, spawns: [{ npc_id: 1 }], loot: [] }));
    fs.utimesSync(f, new Date('2026-01-01'), new Date('2026-01-01'));
    const a = load(f).etag;
    fs.utimesSync(f, new Date('2026-06-01'), new Date('2026-06-01'));
    expect(load(f).etag).toBe(a);
    expect(JSON.parse(load(f).body).fetched_at).toBe('2026-11-19T00:00:00.000Z');
  });

  it('503s without crashing when the file is missing', async () => {
    const srv = http.createServer((req, res) => handle(req, res, '/nonexistent/quest-scripted.json')).listen(0);
    try {
      expect((await get(srv.address().port, {})).status).toBe(503);
    } finally { srv.close(); }
  });

  it('is wired into /api/public/catalog/<name>', () => {
    const src = stripJs(readFileSync(rel('../index.js'), 'utf8'));
    expect(src).toMatch(/which === 'quest-scripted'[\s\S]{0,200}questScriptedCatalog/);
  });
});
