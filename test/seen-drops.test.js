// test/seen-drops.test.js — "Seen in our raids" on /db/item/[id].
// Behaviour: mergeSeenDrops keeps the two bases apart and loadSeenDrops fails soft. Source text (comments
// stripped): the page renders the section, no member name column is read, the migration is service-role only.
//
// Run: npx vitest run test/seen-drops.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs, stripSql } from './_source-slice.js';
import { mergeSeenDrops, loadSeenDrops } from '../web/lib/seenDrops.ts';

describe('mergeSeenDrops', () => {
  it('one row per mob, observed and probable counted apart, newest first, published flag kept', () => {
    const rows = [
      { npc_id: 1, npc_name: 'A Mob', basis: 'observed', times_seen: 2, last_seen: '2026-11-10T00:00:00Z', in_published: true },
      { npc_id: 1, npc_name: 'A Mob', basis: 'probable', times_seen: 1, last_seen: '2026-11-12T00:00:00Z', in_published: true },
      { npc_id: 2, npc_name: 'Other', basis: 'probable', times_seen: 1, last_seen: '2026-11-19T04:14:20Z', in_published: false },
    ];
    const out = mergeSeenDrops(rows);
    expect(out.map(r => r.npc_id)).toEqual([2, 1]);
    expect(out[1]).toMatchObject({ observed: 2, probable: 1, last_seen: '2026-11-12T00:00:00Z', in_published: true });
    expect(out[0]).toMatchObject({ observed: 0, probable: 1, in_published: false });
  });
});

describe('loadSeenDrops', () => {
  it('is empty when the RPC is missing or throws, and with no item name', async () => {
    // rpc() returns a query builder, as supabase-js does; the read is bounded with .limit() (db-read-discipline).
    const missing = { rpc: () => ({ limit: async () => ({ data: null, error: { message: 'no function' } }) }) };
    const boom = { rpc: () => ({ limit: async () => { throw new Error('down'); } }) };
    expect(await loadSeenDrops(missing, 1, 'X')).toEqual([]);
    expect(await loadSeenDrops(boom, 1, 'X')).toEqual([]);
    expect(await loadSeenDrops(boom, 1, null)).toEqual([]);
  });
  it('passes the item id and name to item_seen_drops, bounded, and returns its rows', async () => {
    let args, lim;
    const row = { npc_id: 1, npc_name: 'An_Ancient_Vekerchiki_Champion', zone_short: 'poearthb', loots: 1, last_seen: '2026-11-19T03:00:00Z', in_db: false };
    const sb = { rpc: (fn, a) => { args = [fn, a]; return { limit: async n => { lim = n; return { data: [row], error: null }; } }; } };
    const out = await loadSeenDrops(sb, 27998, 'War Drums of the Rathe');
    expect(args).toEqual(['item_seen_drops', { p_item_id: 27998, p_item_name: 'War Drums of the Rathe' }]);
    expect(lim).toBe(100);
    expect(out.length).toBe(1);
  });
});

describe('wiring', () => {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  it('the item page renders the section and flags pairs missing from the published table', () => {
    const src = stripJs(read('web/app/db/item/[id]/page.tsx'));
    expect(src).toMatch(/loadSeenDrops\(/);
    expect(src).toMatch(/Seen in our raids/);
    expect(src).toMatch(/not in DB/);
  });
  it('the migration reads no character column and is service-role only', () => {
    const sql = stripSql(read('supabase/migrations/20261119120000_item_seen_drops.sql'));
    expect(sql).not.toMatch(/winner_character|speaker|looter|posted_by/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.item_seen_drops/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.item_seen_drops\(integer, text\) TO service_role/);
  });
});
