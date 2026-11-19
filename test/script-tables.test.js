// test/script-tables.test.js — script spawns / loot / rewards tables, their loader, and the mob + item page blocks.
// Behaviour: the extractor is run on a tiny quests tree, the loader's row builders and the page libs are called.
// Source text (comments stripped): migrations are non-destructive and read-only for anon, pages wire the blocks.
//
// Run: npx vitest run test/script-tables.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ROOT, stripJs, stripSql } from './_source-slice.js';
import { mergeNpcSeenDrops, loadNpcSeenDrops, scriptNameKey, handInLabel } from '../web/lib/scriptData.ts';

const require = createRequire(import.meta.url);
const { spawnRows, lootRows, rewardRows } = require('../scripts/sync-script-tables.js');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function extract(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quests-fixture-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  const out = path.join(dir, 'out.json');
  execFileSync('node', [path.join(ROOT, 'scripts/quest-scripted-extract.js'), dir, out], { stdio: 'pipe' });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

describe('extractor: rewards', () => {
  const d = extract({
    'zoneone/Old_Smith.lua': [
      'function event_trade(e)',
      '  if(item_lib.check_turn_in(e.self, e.trade, {item1 = 1001,item2 = 1001,item3 = 1002})) then',
      '    e.other:QuestReward(e.self,0,0,0,0,2001,150);',
      '  elseif(item_lib.check_turn_in(e.self, e.trade, {item1 = 1003})) then',
      '    e.other:QuestReward(e.self,{items = {2002,2003}, exp = 20});',
      '    e.other:SummonCursorItem(2004);',
      '    e.other:QuestReward(e.self,math.random(5),0,0,0,eq.ChooseRandom(2005,2006),0);',
      '  end',
      '-- e.other:QuestReward(e.self,0,0,0,0,9999,1);',
      'end',
    ].join('\n'),
    'zoneone/encounters/Boss.lua': 'function event_death(e)\n e.other:QuestReward(e.self,0,0,0,0,3001)\nend\n',
  });
  const by = (id) => d.rewards.filter(r => r.item_ids.includes(id));

  it('reads a positional reward with its exp and the hand-in above it (qty folded)', () => {
    const r = by(2001)[0];
    expect(r).toMatchObject({ zone: 'zoneone', npc_name: 'Old Smith', npc_id: null, kind: 'reward', exp: 150, script: 'zoneone/Old_Smith.lua:3' });
    expect(r.gives_for).toEqual([{ item_id: 1001, qty: 2 }, { item_id: 1002, qty: 1 }]);
  });
  it('reads the table form and takes the nearest earlier check as the hand-in', () => {
    const r = by(2002)[0];
    expect(r.item_ids).toEqual([2002, 2003]);
    expect(r.exp).toBe(20);
    expect(r.gives_for).toEqual([{ item_id: 1003, qty: 1 }]);
  });
  it('reads SummonCursorItem and ChooseRandom, and counts a computed coin instead of listing it', () => {
    expect(by(2004)[0].kind).toBe('cursor');
    const c = by(2005)[0];
    expect(c.choice_of).toEqual([2005, 2006]);
    expect(c.coin).toBeNull();
  });
  it('ignores a commented-out call and names no npc for a file under encounters/', () => {
    expect(by(9999)).toHaveLength(0);
    expect(by(3001)[0]).toMatchObject({ npc_name: null, npc_id: null, gives_for: null });
  });
});

describe('loader row builders', () => {
  const sha = 'abc123';
  it('one reward row per item, a stable key, duplicates collapsed', () => {
    const d = { rewards: [
      { zone: 'z', npc_id: null, npc_name: 'A B', kind: 'reward', item_ids: [1, 2], choice_of: [1, 2], exp: 5, coin: null, gives_for: [{ item_id: 9, qty: 1 }], script: 'z/A_B.lua:3' },
      { zone: 'z', npc_id: null, npc_name: 'A B', kind: 'reward', item_ids: [1, 2], choice_of: [1, 2], exp: 5, coin: null, gives_for: [{ item_id: 9, qty: 1 }], script: 'z/A_B.lua:3' },
      { zone: 'z', npc_id: null, npc_name: 'C', kind: 'reward', item_ids: [], choice_of: null, exp: 7, coin: null, gives_for: null, script: 'z/C.lua:1' },
    ] };
    const rows = rewardRows(d, sha);
    expect(rows).toHaveLength(3);
    expect(rows.filter(r => r.item_id === null)).toHaveLength(1);
    expect(rows.every(r => r.source_sha === sha)).toBe(true);
    expect(rewardRows(d, sha).map(r => r.row_key)).toEqual(rows.map(r => r.row_key));
    expect(rows.find(r => r.item_id === 1).choice).toBe(true);
  });
  it('spawns and leads share a table, leads flagged and without coordinates', () => {
    const rows = spawnRows({
      spawns: [{ zone: 'z', npc_id: 5, npc_name: null, db: 'placed', api: 'spawn2', x: 1, y: 2, z: 3, heading: 0, loc: 'fixed', script: 'z/a.lua:9', trigger: 't' }],
      script_refs: [{ zone: 'z', npc_id: 6, npc_name: 'n', db: 'no_spawn_rows', script: 'z/a.lua:2' }],
    }, sha);
    expect(rows.map(r => r.is_ref)).toEqual([false, true]);
    expect(rows[1].x).toBeNull();
  });
  it('loot rows skip entries with no literal item id', () => {
    expect(lootRows({ loot: [{ zone: 'z', npc_id: null, item_id: null, script: 's:1' }, { zone: 'z', npc_id: 3, item_id: 4, item_name: 'X', script: 's:2', how: 'AddItem' }] }, sha)).toHaveLength(1);
  });
  it('the committed data file carries all three sections and builds rows from them', () => {
    const d = JSON.parse(read('data/quest-scripted.json'));
    expect(d.rewards.length).toBeGreaterThan(3000);
    expect(spawnRows(d, 'x').length).toBeGreaterThan(2000);
    expect(rewardRows(d, 'x').length).toBeGreaterThan(3000);
  });
});

describe('page libs', () => {
  it('mergeNpcSeenDrops keeps the two bases apart, newest first, and the in-DB flag', () => {
    const out = mergeNpcSeenDrops([
      { item_id: 10230, item_name: 'Ring', basis: 'probable', times_seen: 2, last_seen: '2026-11-19T04:14:20Z', in_published: true },
      { item_id: 27998, item_name: 'Drums', basis: 'probable', times_seen: 1, last_seen: '2026-11-19T04:14:21Z', in_published: false },
      { item_id: 10230, item_name: 'Ring', basis: 'observed', times_seen: 1, last_seen: '2026-11-01T00:00:00Z', in_published: true },
    ]);
    expect(out.map(r => r.item_id)).toEqual([27998, 10230]);
    expect(out[0].in_db).toBe(false);
    expect(out[1]).toMatchObject({ observed: 1, probable: 2, in_db: true });
  });
  it('fails soft when the RPC is missing or throws, and calls npc_seen_drops with the id', async () => {
    expect(await loadNpcSeenDrops({ rpc: async () => ({ data: null, error: { message: 'x' } }) }, 1)).toEqual([]);
    expect(await loadNpcSeenDrops({ rpc: async () => { throw new Error('down'); } }, 1)).toEqual([]);
    let args;
    await loadNpcSeenDrops({ rpc: async (f, a) => { args = [f, a]; return { data: [], error: null }; } }, 218382);
    expect(args).toEqual(['npc_seen_drops', { p_npc_id: 218382 }]);
  });
  it('script file names match catalog names, hand-in labels use qty', () => {
    expect(scriptNameKey('#Old_Smith')).toBe('old smith');
    expect(handInLabel([{ item_id: 1, qty: 2 }, { item_id: 2, qty: 1 }], id => `I${id}`)).toBe('I1 ×2, I2');
  });
});

describe('wiring', () => {
  it('the mob page renders the three blocks and tags pairs "not in DB"', () => {
    const src = stripJs(read('web/app/db/npc/[id]/page.tsx'));
    for (const t of [/loadNpcSeenDrops\(/, /Spawned by script/, /Seen dropping in our raids/, /not in DB/, /Given by script/, /Quest rewards/]) expect(src).toMatch(t);
  });
  it('the item page uses the shorter tag and lists script loot and quest rewards', () => {
    const src = stripJs(read('web/app/db/item/[id]/page.tsx'));
    expect(src).not.toMatch(/not in the published loot table/);
    expect(src).toMatch(/Given by script/);
    expect(src).toMatch(/Quest reward/);
  });
  it('migrations are non-destructive, anon read-only, and the RPCs are service-role only', () => {
    const t = stripSql(read('supabase/migrations/20261119140000_eqemu_script_tables.sql'));
    expect(t).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    for (const n of ['spawns', 'loot', 'rewards']) {
      expect(t).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.eqemu_script_${n}`));
    }
    expect(t).toMatch(/FOR SELECT TO anon, authenticated/);
    const f = stripSql(read('supabase/migrations/20261119140100_npc_seen_drops.sql'));
    expect(f).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(f).not.toMatch(/winner_character|speaker|looter|posted_by/);
    expect(f).toMatch(/GRANT EXECUTE ON FUNCTION public\.npc_seen_drops\(integer\) TO service_role/);
    expect(f).toMatch(/eqemu_script_loot/);
  });
});
