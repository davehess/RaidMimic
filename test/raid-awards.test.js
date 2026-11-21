// test/raid-awards.test.js: the awards card of the raid review (web/lib/raidAwards.ts, raidAwardsLoad.ts).
// The pure builder is driven with invented raiders; the loader against a recording fake database, to prove every
// new read carries the window (or only ids a windowed read returned).
// Run: npx vitest run test/raid-awards.test.js
import { describe, it, expect } from 'vitest';
import { buildAwards, rosterKeys, REZ_FALLBACK, TARGET_GAP_MS } from '../web/lib/raidAwards.ts';
import { loadAwards } from '../web/lib/raidAwardsLoad.ts';
import { anonLabels } from '../web/lib/raidSession.ts';
import { makeWindow, windowIso } from '../web/lib/raidShare.ts';
import { MINUTE_MS } from '../web/lib/raidReplay.ts';

const T0 = Date.parse('2026-11-20T01:02:00Z');
const at = (s) => new Date(T0 + s * 1000).toISOString();
const rez = new Set(REZ_FALLBACK.map(s => s.toLowerCase()));
const base = { players: [], taken: [], deaths: [], casts: [], targets: [], rezSpells: rez, roster: new Set(), anon: new Map() };
const get = (aw, k) => aw.find(a => a.key === k);

describe('awards builder', () => {
  it('damage sums per name over fights, EVERY raider with a value (the card shows three until "show all"), pets left out', () => {
    const players = [
      { encounter_id: 'a', character_name: 'Aldenmar', total_damage: 100, dps: 1 },
      { encounter_id: 'b', character_name: 'Aldenmar', total_damage: 50, dps: 1 },
      { encounter_id: 'a', character_name: 'Brackwyn', total_damage: 120, dps: 1 },
      { encounter_id: 'a', character_name: 'Corvale', total_damage: 10, dps: 1 },
      { encounter_id: 'a', character_name: 'Rethlan', total_damage: 5, dps: 1 },
      { encounter_id: 'a', character_name: 'Aldenmar`s pet', total_damage: 9999, dps: 1 },
    ];
    expect(get(buildAwards({ ...base, players }), 'damage').rows).toEqual([
      { name: 'Aldenmar', value: 150 }, { name: 'Brackwyn', value: 120 }, { name: 'Corvale', value: 10 }, { name: 'Rethlan', value: 5 }]);
  });

  it('damage taken is the MAX per (fight, character), then summed', () => {
    const taken = [
      { encounter_id: 'a', character_name: 'Aldenmar', dmg: '500' },
      { encounter_id: 'a', character_name: 'Aldenmar', dmg: '450' },   // a second submitter of the same fight
      { encounter_id: 'b', character_name: 'Aldenmar', dmg: 100 },
      { encounter_id: 'a', character_name: 'Brackwyn', dmg: '550' },
      { encounter_id: 'a', character_name: 'Corvale', dmg: null },
    ];
    expect(get(buildAwards({ ...base, taken }), 'taken').rows).toEqual([{ name: 'Aldenmar', value: 600 }, { name: 'Brackwyn', value: 550 }]);
  });

  it('rez casts count only resurrection spells; Divine Intervention is its own count; all spells count', () => {
    const c = (caster, spell) => ({ caster, spell, cast_at: at(1) });
    const casts = [c('Aldenmar', 'Resurrection'), c('Aldenmar', 'Divine Intervention'), c('Aldenmar', 'Complete Heal'),
      c('Brackwyn', 'Customer Service Resurrect'), c('Brackwyn', 'Reviviscence'), c('Brackwyn', 'Reviviscence')];
    const aw = buildAwards({ ...base, casts });
    expect(get(aw, 'rez').rows).toEqual([{ name: 'Brackwyn', value: 2 }, { name: 'Aldenmar', value: 1 }]);
    expect(get(aw, 'di').rows).toEqual([{ name: 'Aldenmar', value: 1 }]);
    expect(get(aw, 'spells').rows).toEqual([{ name: 'Aldenmar', value: 3 }, { name: 'Brackwyn', value: 3 }]);
  });

  it('first on target: a new cluster after a gap, the earliest character wins, players and corpses are not mobs', () => {
    const t = (character, target_name, s) => ({ character, target_name, at: at(s) });
    const targets = [
      t('Brackwyn', 'a fire beetle', 20), t('Aldenmar', 'a fire beetle', 0),      // unsorted on purpose: Aldenmar is first
      t('Corvale', 'a fire beetle', 60),                                           // same cluster
      t('Corvale', 'a fire beetle', 60 + TARGET_GAP_MS / 1000 + 1),               // gap: a new cluster, Corvale first
      t('Aldenmar', 'Brackwyn', 5),                                                // a player (on the roster)
      t('Aldenmar', "a fire beetle's corpse", 7),
      t('Aldenmar', null, 9),
    ];
    const aw = buildAwards({ ...base, targets });
    expect(get(aw, 'first').rows).toEqual([{ name: 'Aldenmar', value: 1 }, { name: 'Corvale', value: 1 }]);
  });

  it('a raid filter (keep) cuts casts and targets before they count', () => {
    const casts = [{ caster: 'Aldenmar', spell: 'Heal', cast_at: at(1) }, { caster: 'Brackwyn', spell: 'Heal', cast_at: at(1) }];
    const aw = buildAwards({ ...base, casts, keep: (n) => n === 'Brackwyn' });
    expect(get(aw, 'spells').rows).toEqual([{ name: 'Brackwyn', value: 1 }]);
  });

  it('an opted-out raider shows as their label in every category, never their name', () => {
    const anon = anonLabels([{ name: 'Hushed', class: 'Wizard', exclude_from_stats: true }]);
    const aw = buildAwards({
      ...base, anon,
      players: [{ encounter_id: 'a', character_name: 'Hushed', total_damage: 90, dps: 1 }],
      deaths: [{ name: 'Hushed', n: 4 }],
      casts: [{ caster: 'Hushed', spell: 'Resurrection', cast_at: at(1) }],
      targets: [{ character: 'Hushed', target_name: 'a bat', at: at(1) }],
    });
    expect(aw.map(a => a.key)).toEqual(['damage', 'deaths', 'spells', 'rez', 'first']);
    expect(JSON.stringify(aw)).not.toContain('Hushed');
    expect(get(aw, 'deaths').rows[0]).toEqual({ name: 'Wizard 1', value: 4 });
  });

  it('a category with no data is left out, and nothing at all gives an empty list', () => {
    expect(buildAwards(base)).toEqual([]);
    expect(buildAwards({ ...base, deaths: [{ name: 'Aldenmar', n: 2 }] }).map(a => a.key)).toEqual(['deaths']);
  });

  it('rosterKeys reads the who lists', () => {
    expect([...rosterKeys([{ data: JSON.stringify({ who: [['Aldenmar', 'Cleric'], ['Brackwyn`s pet']] }) }, { data: 'junk' }])].sort()).toEqual(['aldenmar', 'brackwyn']);
  });
});

// A recording fake of the slice of PostgREST the loader uses (as in test/raid-share.test.js).
function fakeDb(tables) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, ops: [] };
      queries.push(q);
      const rec = (op) => (...a) => { q.ops.push([op, ...a]); return b; };
      const b = {
        select: rec('select'), eq: rec('eq'), or: rec('or'), in: rec('in'), gte: rec('gte'), lt: rec('lt'), order: rec('order'), range: rec('range'),
        then(res, rej) { return Promise.resolve({ data: tables[table] ?? [], error: null }).then(res, rej); },
      };
      return b;
    },
  };
}
const hasOp = (q, name, ...args) => q.ops.some(o => o[0] === name && args.every((x, i) => o[i + 1] === x));

describe('the awards loader bounds its reads', () => {
  const W = makeWindow(T0 + 3 * MINUTE_MS, T0 + 77 * MINUTE_MS);
  const { from, to } = windowIso(W);
  const db = fakeDb({
    raid_casts: [{ id: 1, caster: 'Aldenmar', spell: 'Resurrection', cast_at: from }],
    target_observations: [{ id: 1, character: 'Aldenmar', target_name: 'a bat', at: from }],
    encounter_combat_rollup: [{ id: 'r1', encounter_id: 'e1', character_name: 'Aldenmar', dmg: '70' }],
    eqemu_spells: [{ id: 1, name: 'Resurrection' }, { id: 2, name: 'Customer Service Resurrect' }],
  });
  const src = { players: [], encounterIds: ['e1'], roster: new Set(), anon: new Map(), scope: null };
  let out;
  it('runs', async () => {
    out = await loadAwards(db, W, src, []);
    expect(out.map(a => a.key)).toEqual(['taken', 'spells', 'rez', 'first']);
  });
  for (const [table, col] of Object.entries({ raid_casts: 'cast_at', target_observations: 'at' })) {
    it(`${table} is read with ${col} >= from and < to, exactly the window`, () => {
      const qs = db.queries.filter(q => q.table === table);
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) { expect(hasOp(q, 'gte', col, from)).toBe(true); expect(hasOp(q, 'lt', col, to)).toBe(true); }
    });
  }
  it('the rollup has no time column: it is read only for the review\'s fight ids', () => {
    const qs = db.queries.filter(q => q.table === 'encounter_combat_rollup');
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) expect(q.ops.find(o => o[0] === 'in')[2]).toEqual(['e1']);
  });
  it('nothing else is read, and the rollup selects the damage-taken field only', () => {
    expect(new Set(db.queries.map(q => q.table))).toEqual(new Set(['raid_casts', 'target_observations', 'encounter_combat_rollup', 'eqemu_spells']));
    const sel = db.queries.find(q => q.table === 'encounter_combat_rollup').ops.find(o => o[0] === 'select')[1];
    expect(sel).toContain('taken->>damageTaken');
  });
});
