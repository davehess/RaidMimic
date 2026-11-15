// test/hub-characters-poisoning.test.js — raidmimic.com "My characters": one player cannot poison another's flags by
// uploading the same character name. Runs the real import against ONE shared in-memory store whose deps mirror
// web/app/characters/actions.ts (rows keyed on the player id), for two players. Names are invented.
//
// Run: npx vitest run test/hub-characters-poisoning.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readSource, stripJs } from './_source-slice.js';
import { importExports } from '../web/lib/hubImport.ts';
import { characterView, overallRows, wantsOverall } from '../web/lib/hubCharactersView.ts';
import { groupConflicts } from '../web/lib/hubConflicts.ts';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const reply = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'popflags-real-a.txt'), 'utf8').split('\n').filter(Boolean);
const fileText = (name, lines = reply) => `Character\t${name}\nTimestamp\t2026-11-08_21-30-00\n---\n${lines.join('\n')}\n`;
const up = (name, lines) => { const text = fileText(name, lines); return { name: `${name}-PoPFlags.txt`, text, size: text.length }; };

function makeStore() {
  const chars = []; const flags = [];
  const depsFor = (playerId, discordId) => ({
    playerId, discordId, now: () => NOW,
    heldNames: async () => chars.filter(c => c.player_id === playerId).map(c => c.name_lc),
    wolfpackOwners: async () => new Map(),
    holders: async (lcs) => { const m = new Map(); for (const c of chars.filter(c => lcs.includes(c.name_lc))) { if (!m.has(c.name_lc)) m.set(c.name_lc, []); m.get(c.name_lc).push({ player_id: c.player_id, proof: c.proof }); } return m; },
    insertCharacters: async (rows) => { chars.push(...rows.map(r => ({ ...r }))); return null; },
    touchCharacters: async () => null,
    flipContested: async (lcs) => { for (const c of chars) if (lcs.includes(c.name_lc) && c.proof === 'claimed') c.proof = 'contested'; return null; },
    insertFlags: async (rows) => { flags.push(...rows.map(r => ({ ...r }))); return null; },
  });
  // what loadMine reads for one player: only rows with that player_id
  const mine = (playerId) => chars.filter(c => c.player_id === playerId).map(c =>
    characterView(c.name, c.proof, flags.filter(f => f.player_id === playerId && f.name_lc === c.name_lc)));
  return { chars, flags, depsFor, mine };
}

describe('two players, the same character name', () => {
  const A_LINES = reply;
  const B_LINES = reply.slice(0, 20);

  it('stores each upload under its own player only and leaves the first holder untouched', async () => {
    const st = makeStore();
    await importExports([up('Aldenmar', A_LINES)], st.depsFor('p-a', '111'));
    const aFlagsBefore = st.flags.filter(f => f.player_id === 'p-a').map(f => f.flag_key);
    const r = await importExports([up('Aldenmar', B_LINES)], st.depsFor('p-b', '222'));
    expect(r.characters[0].status).toBe('contested');
    // A's flags are exactly what they were; B's rows carry B's id
    expect(st.flags.filter(f => f.player_id === 'p-a').map(f => f.flag_key)).toEqual(aFlagsBefore);
    expect(st.flags.every(f => f.player_id === 'p-a' || f.player_id === 'p-b')).toBe(true);
    expect(st.flags.filter(f => f.player_id === 'p-b').length).toBeGreaterThan(0);
    // both name rows exist, one per player, both contested now
    expect(st.chars.map(c => [c.player_id, c.proof]).sort()).toEqual([['p-a', 'contested'], ['p-b', 'contested']]);
  });

  it("each player's own view shows only their own flags", async () => {
    const st = makeStore();
    await importExports([up('Aldenmar', A_LINES)], st.depsFor('p-a', '111'));
    await importExports([up('Aldenmar', B_LINES)], st.depsFor('p-b', '222'));
    const a = st.mine('p-a')[0], b = st.mine('p-b')[0];
    expect(a.flagCount).toBeGreaterThan(b.flagCount);
    const onlyB = new Set(st.flags.filter(f => f.player_id === 'p-b').map(f => f.flag_key));
    expect(b.flagCount).toBe(onlyB.size);
    expect(st.mine('p-c')).toEqual([]);
  });

  it("B cannot overwrite or remove A's flags by re-uploading, whatever the file claims", async () => {
    const st = makeStore();
    await importExports([up('Aldenmar', A_LINES)], st.depsFor('p-a', '111'));
    const before = JSON.stringify(st.flags.filter(f => f.player_id === 'p-a'));
    await importExports([up('Aldenmar', []), up('Aldenmar', B_LINES)], st.depsFor('p-b', '222'));
    await importExports([up('Aldenmar', B_LINES)], st.depsFor('p-b', '222'));
    expect(JSON.stringify(st.flags.filter(f => f.player_id === 'p-a'))).toBe(before);
  });

  it('a name another player has proven is refused and writes nothing', async () => {
    const st = makeStore();
    st.chars.push({ player_id: 'p-a', name: 'Aldenmar', name_lc: 'aldenmar', proof: 'proven' });
    const r = await importExports([up('Aldenmar', B_LINES)], st.depsFor('p-b', '222'));
    expect(r.characters[0].status).toBe('refused');
    expect(st.flags).toHaveLength(0);
    expect(st.chars).toHaveLength(1);
  });
});

describe('the write path takes the player from the session, never the form', () => {
  const actions = stripJs(readSource(path.join(ROOT, 'web', 'app', 'characters', 'actions.ts')));
  it('never reads a player or discord id from form data', () => {
    expect(actions).not.toMatch(/formData\.get\(\s*['"](player|discord)/i);
    expect(actions).not.toMatch(/getAll\(\s*['"](player|discord)/i);
  });
  it('keys every write on the session player', () => {
    expect(actions).toMatch(/depsFor\(s\.admin, s\.playerId, s\.discordId\)/);
    expect(actions).toMatch(/\.eq\('player_id', playerId\)/);
    expect(actions).toMatch(/\.eq\('player_id', player\.player_id\)\.eq\('name_lc', lc\)/);
  });
});

describe('the Overall view and the officer conflicts list', () => {
  it('opens on Overall unless a real gate is named', () => {
    expect(wantsOverall(undefined)).toBe(true);
    expect(wantsOverall('overall')).toBe(true);
    expect(wantsOverall('nonsense')).toBe(true);
    expect(wantsOverall('solro')).toBe(false);
  });
  it('lists one row per character, most flags first, with done of total per gate', () => {
    const rows = overallRows([characterView('Brackwyn', 'claimed', []), characterView('Aldenmar', 'claimed', [{ flag_key: 'nope', earned_at: 'x' }])]);
    expect(rows.map(r => r.name)).toEqual(['Aldenmar', 'Brackwyn']);
    expect(rows[0].gates.length).toBeGreaterThan(3);
    expect(rows[0].gates.every(g => g.done >= 0 && g.done <= g.total)).toBe(true);
  });
  it('groups only names held by 2+ players, counting each holder\'s own distinct flags', () => {
    const chars = [
      { player_id: 'p-a', name: 'Aldenmar', name_lc: 'aldenmar', proof: 'contested', first_seen_at: '2026-11-01T00:00:00Z', last_seen_at: '2026-11-02T00:00:00Z' },
      { player_id: 'p-b', name: 'Aldenmar', name_lc: 'aldenmar', proof: 'contested', first_seen_at: '2026-11-03T00:00:00Z', last_seen_at: '2026-11-03T00:00:00Z' },
      { player_id: 'p-a', name: 'Corvale', name_lc: 'corvale', proof: 'claimed', first_seen_at: '2026-11-01T00:00:00Z', last_seen_at: '2026-11-01T00:00:00Z' },
    ];
    const players = [{ player_id: 'p-a', discord_id: '111', display_name: 'one' }, { player_id: 'p-b', discord_id: '222', display_name: 'two' }];
    const flags = [
      { player_id: 'p-a', name_lc: 'aldenmar', flag_key: 'x' }, { player_id: 'p-a', name_lc: 'aldenmar', flag_key: 'x' }, { player_id: 'p-a', name_lc: 'aldenmar', flag_key: 'y' },
      { player_id: 'p-b', name_lc: 'aldenmar', flag_key: 'x' },
    ];
    const out = groupConflicts(chars, players, flags);
    expect(out).toHaveLength(1);
    expect(out[0].holders.map(h => [h.discordId, h.flagCount])).toEqual([['111', 2], ['222', 1]]);
  });
});
