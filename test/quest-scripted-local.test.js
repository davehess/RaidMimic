// The agent's local copy of the quest-scripted dataset: loads the bundled file, tolerates a missing or bad one,
// refreshes from the bot's public catalog route by ETag, and answers GET /api/local/quest-scripted.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { AGENT_INDEX, readSource, stripJs } from './_source-slice.js';

let agent;
beforeAll(() => { agent = createRequire(import.meta.url)('../packages/wolfpack-logsync/index.js'); });
beforeEach(() => { agent._questScriptedResetForTest(); });

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qs-'));
const SAMPLE = { fetched_at: '2026-11-19T00:00:00Z', etag: '"abc"', entries: [{ zone: 'poeartha', npc_id: 1 }], loot: [{ item_id: 2 }] };

function route(url) {
  return new Promise((resolve) => {
    const res = { writeHead(s) { this.status = s; }, end(b) { resolve({ status: this.status, body: JSON.parse(b) }); } };
    expect(agent._localQuestScriptedRoute({ method: 'GET', url }, res)).toBe(true);
  });
}

describe('quest-scripted on this PC', () => {
  it('loads nothing, quietly, when the bundled file is missing', async () => {
    expect(agent.loadQuestScriptedFromDisk(path.join(tmp(), 'nope.json'))).toBe(false);
    expect(await route('/api/local/quest-scripted')).toEqual({ status: 200, body: { loaded: false, entries: [] } });
  });

  it('ignores a corrupt or wrong-shaped file', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'a.json'), '{not json');
    fs.writeFileSync(path.join(d, 'b.json'), '{"entries":5}');
    expect(agent.loadQuestScriptedFromDisk(path.join(d, 'a.json'))).toBe(false);
    expect(agent.loadQuestScriptedFromDisk(path.join(d, 'b.json'))).toBe(false);
    expect(agent._questScriptedForTest()).toBe(null);
  });

  it('loads a bundled file and the local route returns it', async () => {
    const f = path.join(tmp(), 'logsync.quest-scripted.json');
    fs.writeFileSync(f, JSON.stringify(SAMPLE));
    expect(agent.loadQuestScriptedFromDisk(f)).toBe(true);
    const r = await route('/api/local/quest-scripted?x=1');
    expect(r.status).toBe(200);
    expect(r.body.entries).toEqual(SAMPLE.entries);
    expect(r.body.loot).toEqual(SAMPLE.loot);
  });

  it('only answers GET on its own path', () => {
    const res = { writeHead() { throw new Error('should not answer'); }, end() {} };
    expect(agent._localQuestScriptedRoute({ method: 'POST', url: '/api/local/quest-scripted' }, res)).toBe(false);
    expect(agent._localQuestScriptedRoute({ method: 'GET', url: '/api/local/other' }, res)).toBe(false);
  });

  it('refreshes by ETag from the public route, keeps the last good copy on failure', async () => {
    const d = tmp();
    const file = path.join(d, 'logsync.quest-scripted.json');
    const seen = [];
    let mode = 'ok';
    const srv = http.createServer((req, res) => {
      seen.push({ url: req.url, inm: req.headers['if-none-match'] || null, auth: req.headers.authorization || null });
      if (mode === '304') { res.writeHead(304); return res.end(); }
      if (mode === '500') { res.writeHead(500); return res.end('x'); }
      res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"v1"' });
      res.end(JSON.stringify({ version: 1, fetched_at: 'now', entries: [{ zone: 'z', npc_id: 9 }], loot: [] }));
    }).listen(0);
    try {
      const botUrl = `http://127.0.0.1:${srv.address().port}/api/agent/encounter`;
      await agent.fetchQuestScripted({ botUrl, file });
      expect(seen[0].url).toBe('/api/public/catalog/quest-scripted');
      expect(seen[0].auth).toBe(null);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).etag).toBe('"v1"');
      mode = '304';
      await agent.fetchQuestScripted({ botUrl, file });
      expect(seen[1].inm).toBe('"v1"');
      mode = '500';
      await agent.fetchQuestScripted({ botUrl, file });
      expect(agent._questScriptedForTest().entries[0].npc_id).toBe(9);
      // a bot URL that is not the agent route is left alone
      const n = seen.length;
      await agent.fetchQuestScripted({ botUrl: `http://127.0.0.1:${srv.address().port}/elsewhere`, file });
      expect(seen.length).toBe(n);
    } finally { srv.close(); }
  });

  it('is bundled by the installer step under the name the agent reads', () => {
    const stage = stripJs(fs.readFileSync(new URL('../apps/mimic/scripts/stage-catalog.js', import.meta.url), 'utf8'));
    expect(stage).toMatch(/\['quest-scripted',\s*'logsync\.quest-scripted\.json'\]/);
    expect(/logsync\.quest-scripted\.json/.test(readSource(AGENT_INDEX))).toBe(true);
  });

  it('is served by the dashboard server and loaded at boot', () => {
    const src = stripJs(readSource(AGENT_INDEX));
    expect(src).toMatch(/if \(_localQuestScriptedRoute\(req, res\)\) return;/);
    expect(src).toMatch(/loadItemCatalogFromDisk\(\);\s*loadQuestScriptedFromDisk\(\);/);
    expect((src.match(/fetchQuestScripted\(\{ botUrl \}\)/g) || []).length).toBe(2);
  });
});
