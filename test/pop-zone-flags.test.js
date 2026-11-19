// test/pop-zone-flags.test.js — GET /api/agent/pop-zone-flags (utils/popZoneFlags.js), the Command Center's
// "in the raid but not flagged for this zone" (the guild lead, 2026-11-19). The rule: only a FULL read (the Seer's
// recital or a #popflags read) turns an absent flag into 'missing'; everything else we cannot see is 'unknown'.
// Names are invented. Run: npx vitest run test/pop-zone-flags.test.js

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create, classify } = require('../utils/popZoneFlags');

// Who holds what, who has had a full read, who opted out.
function setup({ held = {}, reads = [], optOut = [], fail = null } = {}) {
  const calls = { load: 0 };
  const supabase = {
    isEnabled: () => true,
    select: async (table) => { if (fail === 'characters') throw new Error('down'); return table === 'characters' ? optOut.map(name => ({ name })) : []; },
    selectAllPaged: async () => { if (fail === 'reads') throw new Error('down'); return reads.map(character => ({ character })); },
  };
  const status = { load: async (names) => { calls.load++; if (fail === 'load') throw new Error('down'); return new Map(names.map(n => [n.toLowerCase(), new Set(held[n.toLowerCase()] || [])])); } };
  let t = 1_000_000;
  const svc = create({ supabase, guildId: 'g', status, now: () => t });
  return { svc, calls, tick: (ms) => { t += ms; } };
}
const ask = (svc, zone, names) => svc.answer({ zone, names });

describe('classify', () => {
  it('is flagged when the gate flag is held', () => {
    expect(classify(require('../utils/popEngine').POP_ZONES.find(z => z.key === 'valor'), ['trial_justice'], false)).toBe('flagged');
  });
  it('is unknown without a full read and missing with one', () => {
    const z = require('../utils/popEngine').POP_ZONES.find(x => x.key === 'valor');
    expect(classify(z, [], false)).toBe('unknown');
    expect(classify(z, [], true)).toBe('missing');
  });
});

describe('pop-zone-flags answer', () => {
  it('splits a raid into flagged, missing and unknown', async () => {
    const { svc } = setup({ held: { aldenmar: ['trial_justice'] }, reads: ['Aldenmar', 'Brackwyn'] });
    const r = await ask(svc, 'valor', ['Aldenmar', 'Brackwyn', 'Corvale']);
    expect(r).toEqual({ zone: 'valor', members: { aldenmar: 'flagged', brackwyn: 'missing', corvale: 'unknown' } });
  });

  it('never calls a character with no read unflagged', async () => {
    const { svc } = setup();
    expect((await ask(svc, 'valor', ['Rethlan'])).members.rethlan).toBe('unknown');
  });

  it('answers unknown for an opted-out character even with a full read', async () => {
    const { svc } = setup({ reads: ['Nyssara'], optOut: ['Nyssara'] });
    expect((await ask(svc, 'valor', ['Nyssara'])).members.nyssara).toBe('unknown');
  });

  it('answers unknown, and does not cache, when a read fails', async () => {
    for (const fail of ['load', 'reads', 'characters']) {
      const { svc } = setup({ held: { zarrin: ['trial_justice'] }, fail });
      const r = await ask(svc, 'valor', ['Zarrin']);
      expect(r.members.zarrin).toBe('unknown');
      expect(svc._cache.size).toBe(0);
    }
  });

  it('is null for a zone with no gate or an unknown key', async () => {
    const { svc } = setup();
    expect(await ask(svc, 'justice', ['Aldenmar'])).toBeNull();
    expect(await ask(svc, 'nope', ['Aldenmar'])).toBeNull();
  });

  it('drops names that are not letters, dedupes by case and caps at 80', async () => {
    const { svc } = setup();
    const many = Array.from({ length: 100 }, (_, i) => 'Raider' + String.fromCharCode(97 + (i % 26)).repeat(1 + Math.floor(i / 26)));
    const r = await ask(svc, 'valor', ['Aldenmar', 'ALDENMAR', 'x', "o'brien", '1234', ...many]);
    expect(Object.keys(r.members).length).toBeLessThanOrEqual(80);
    expect(r.members.aldenmar).toBe('unknown');
    expect(Object.keys(r.members)).not.toContain("o'brien");
  });

  it('serves a repeat ask from the cache for a minute, then reads again', async () => {
    const { svc, calls, tick } = setup({ held: { aldenmar: ['trial_justice'] } });
    await ask(svc, 'valor', ['Aldenmar']);
    await ask(svc, 'valor', ['Aldenmar']);
    expect(calls.load).toBe(1);
    tick(61_000);
    await ask(svc, 'valor', ['Aldenmar']);
    expect(calls.load).toBe(2);
  });
});
