// test/combat-rollup-taken.test.js — a character's own incoming swings are kept per fight on encounter_combat_rollup.taken.
//   1. recordParse under a stubbed PostgREST: `taken` is written for the uploader's own character only, as a taken-only row
//      (no by_skill / totals, so the outgoing rollup is not overwritten); other defenders (NPCs, other raiders) are never stored;
//   2. a re-upload keeps the version with more total swings;
//   3. the migration adds the column idempotently, backfills only where taken is null, and grants the RPC to authenticated only.
//
// Run: npx vitest run test/combat-rollup-taken.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readSource, ROOT, stripSql } from './_source-slice.js';

const require = createRequire(import.meta.url);
const supabase = require('../utils/supabase.js');

const MIGRATION = stripSql(readSource(path.join(ROOT, 'supabase', 'migrations', '20261115000000_combat_rollup_taken.sql')));

function fakeRest(existingTaken = null) {
  const calls = [];
  const fetchStub = vi.fn(async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method || 'GET', path: u.pathname.replace('/rest/v1', ''), query: u.search, body });
    const json = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), headers: { get: () => null } });
    const p = u.pathname.replace('/rest/v1', '');
    if (p === '/bosses_local') return json([{ npc_id: 5, zone_short: 'zone' }]);
    if (p === '/rpc/find_or_create_encounter') return json('enc-uuid-1');
    if (p === '/contributions') return json([{ id: 'contrib-1' }]);
    if (p === '/encounter_combat_rollup' && (init.method || 'GET') === 'GET') return json(existingTaken ? [{ taken: existingTaken }] : []);
    if (p === '/encounter_combat_rollup') return json([{ id: 'r1' }]);
    if (p === '/encounters' && (init.method || 'GET') === 'GET') return json([{ npc_healed_total: 0 }]);
    return json([]);
  });
  return { calls, fetchStub };
}

const DEFENDERS = [
  { name: 'aldenmar', hits: 10, damageTaken: 5000, misses: 4, dodges: 3, parries: 2, ripostes: 1, blocks: 0, invulns: 0, rampageHits: 2, rampageDmg: 900 },
  { name: 'Brackwyn', hits: 99, damageTaken: 99999, misses: 1 },
  { name: 'a gnoll', hits: 7 },
];

function run(extra = {}) {
  return supabase.recordParse({
    bossInternalId: 'a_boss',
    parsed: { duration: 90, totalDamage: 1000, players: [{ name: 'Aldenmar' }], defenders: DEFENDERS },
    timestampMs: Date.parse('2026-10-29T01:00:00Z'),
    contributorDiscordId: null,
    contributorCharacter: 'Aldenmar',
    uploadedByDiscordId: 'd1',
    rollupByChar: { Aldenmar: { by_skill: { crush: { hits: 1, dmg: 5 } }, total_hits: 1, total_damage: 5 } },
    ...extra,
  });
}

const takenWrites = (calls) => calls.filter((c) => c.method === 'POST' && c.path === '/encounter_combat_rollup' && c.body?.some((r) => 'taken' in r));

let saved;
beforeEach(() => {
  saved = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY, g: process.env.SUPABASE_GUILD_ID };
  process.env.SUPABASE_URL = 'https://example.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-tests';
  process.env.SUPABASE_GUILD_ID = 'wolfpack';
  supabase._resetBreaker();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of [['SUPABASE_URL', saved.u], ['SUPABASE_SERVICE_ROLE_KEY', saved.k], ['SUPABASE_GUILD_ID', saved.g]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('taken ingest', () => {
  it('writes only the uploader\'s own defender row, as a taken-only row', async () => {
    const { calls, fetchStub } = fakeRest();
    vi.stubGlobal('fetch', fetchStub);
    await run();
    const w = takenWrites(calls);
    expect(w).toHaveLength(1);
    expect(w[0].body).toHaveLength(1);
    const r = w[0].body[0];
    expect(r).toMatchObject({ guild_id: 'wolfpack', encounter_id: 'enc-uuid-1', character_name: 'Aldenmar' });
    expect(r.taken).toEqual({ hits: 10, damageTaken: 5000, misses: 4, dodges: 3, parries: 2, ripostes: 1, blocks: 0, invulns: 0, rampageHits: 2, rampageDmg: 900 });
    // not another defender's numbers
    expect(JSON.stringify(w)).not.toMatch(/99999|Brackwyn|gnoll/);
    // taken-only: it must not carry columns that would overwrite the outgoing rollup on merge
    expect(Object.keys(r).sort()).toEqual(['character_name', 'encounter_id', 'guild_id', 'taken']);
  });

  it('writes nothing when the uploader has no defender row of their own', async () => {
    const { calls, fetchStub } = fakeRest();
    vi.stubGlobal('fetch', fetchStub);
    await run({ contributorCharacter: 'Zarrin' });
    expect(takenWrites(calls)).toHaveLength(0);
  });

  it('re-upload: keeps the stored version when it has more total swings', async () => {
    const { calls, fetchStub } = fakeRest({ hits: 50, misses: 10 });   // 60 swings stored vs 20 incoming
    vi.stubGlobal('fetch', fetchStub);
    await run();
    expect(takenWrites(calls)).toHaveLength(0);
  });

  it('re-upload: replaces the stored version when the new one has more total swings', async () => {
    const { calls, fetchStub } = fakeRest({ hits: 3, misses: 1 });     // 4 stored vs 20 incoming
    vi.stubGlobal('fetch', fetchStub);
    await run();
    expect(takenWrites(calls)).toHaveLength(1);
  });
});

describe('migration 20261115000000_combat_rollup_taken.sql', () => {
  it('adds the column idempotently', () => {
    expect(MIGRATION).toMatch(/alter table public\.encounter_combat_rollup add column if not exists taken jsonb;/);
    expect(MIGRATION).not.toMatch(/\bdrop\b/i);
  });
  it('backfills only own-character defenders, only where taken is still null', () => {
    expect(MIGRATION).toMatch(/lower\(d\.value ->> 'name'\) = lower\(c\.contributor_character\)/);
    expect(MIGRATION).toMatch(/where public\.encounter_combat_rollup\.taken is null;/);
  });
  it('grants the trends RPC to authenticated only, guild-scoped', () => {
    expect(MIGRATION).toMatch(/grant execute on function public\.character_combat_trends\(text, int\) to authenticated;/);
    expect(MIGRATION.match(/grant [^;]*;/gi)).toHaveLength(1);
    expect(MIGRATION).toMatch(/r\.guild_id in \(select public\.my_guild_ids\(\)\)/);
    expect(MIGRATION).toMatch(/limit 500/);
  });
});
