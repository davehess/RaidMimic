// test/character-combat.test.js — the pure mapping behind /character/<name>/combat (web/lib/characterCombat.ts).
// Behaviour, not text: every function is called.
// Run: npx vitest run test/character-combat.test.js

import { describe, it, expect } from 'vitest';
import {
  nightKey, median, avoidance, summarizeTaken, aggregateNights, dpsSpread, mergeHist, histQuantile,
  abilityTable, abilityShareByNight, harmTouch, summarizeWeave, weaveByNight, parseDays, cleanFights,
  COMBAT_VISIBILITY,
} from '../web/lib/characterCombat.ts';

const T = (o = {}) => ({ hits: 0, damageTaken: 0, misses: 0, dodges: 0, parries: 0, ripostes: 0, blocks: 0, invulns: 0, rampageHits: 0, rampageDmg: 0, ...o });
const F = (o = {}) => ({ encounter_id: 1, started_at: '2026-11-12T01:00:00Z', boss: 'x', duration: 60, total_damage: 6000, dps: 100, by_skill: {}, taken: null, ...o });

describe('visibility', () => {
  it('defaults to the safe scope', () => expect(COMBAT_VISIBILITY).toBe('OWNER'));
});

describe('nightKey', () => {
  it('puts a fight after midnight ET on the night before', () => {
    // 2026-11-12 01:00Z = Nov 11 20:00 EST; 2026-11-12 04:30Z = Nov 11 23:30 EST; 2026-11-12 06:00Z = Nov 12 01:00 EST
    expect(nightKey('2026-11-12T01:00:00Z')).toBe('2026-11-11');
    expect(nightKey('2026-11-12T05:30:00Z')).toBe('2026-11-11'); // 00:30 EST
    expect(nightKey('2026-11-12T06:30:00Z')).toBe('2026-11-11'); // 01:30 EST, still last night
    expect(nightKey('2026-11-12T23:00:00Z')).toBe('2026-11-12');
  });
  it('is empty for junk', () => expect(nightKey('nope')).toBe(''));
});

describe('median', () => {
  it('handles odd, even, empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('avoidance', () => {
  it('is avoided / (avoided + hits), with the split', () => {
    const a = avoidance(T({ hits: 60, misses: 10, dodges: 10, parries: 5, ripostes: 5, blocks: 10 }));
    expect(a.swings).toBe(100);
    expect(a.avoided).toBe(40);
    expect(a.pct).toBeCloseTo(40);
    expect(a.split).toEqual({ misses: 10, dodges: 10, parries: 5, ripostes: 5, blocks: 10 });
  });
  it('is null with no swings and survives null taken', () => {
    expect(avoidance(null).pct).toBeNull();
    expect(avoidance(T()).pct).toBeNull();
  });
  it('does not count invulns as avoided', () => {
    expect(avoidance(T({ hits: 1, invulns: 9 })).pct).toBe(0);
  });
});

describe('summarizeTaken', () => {
  it('pools only fights that carry taken; per-minute and rampage share', () => {
    const s = summarizeTaken([
      F({ duration: 60, taken: T({ hits: 10, damageTaken: 1000, misses: 10, rampageDmg: 250 }) }),
      F({ duration: 120, taken: T({ hits: 10, damageTaken: 2000, dodges: 10, rampageDmg: 0 }) }),
      F({ duration: 600, taken: null }),
    ]);
    expect(s.fights).toBe(2);
    expect(s.damageTaken).toBe(3000);
    expect(s.damagePerFight).toBe(1500);
    expect(s.damagePerMin).toBeCloseTo(3000 / 3);
    expect(s.pct).toBeCloseTo(50);
    expect(s.rampageSharePct).toBeCloseTo((250 / 3000) * 100);
  });
  it('returns nulls, not NaN, when empty', () => {
    const s = summarizeTaken([F()]);
    expect(s.fights).toBe(0);
    expect(s.damagePerMin).toBeNull();
    expect(s.rampageSharePct).toBeNull();
  });
});

describe('aggregateNights', () => {
  it('groups by raid night with time-weighted DPS (not a mean of DPS)', () => {
    const n = aggregateNights([
      F({ started_at: '2026-11-12T01:00:00Z', duration: 10, total_damage: 10000, dps: 1000 }),
      F({ started_at: '2026-11-12T02:00:00Z', duration: 90, total_damage: 9000, dps: 100 }),
      F({ started_at: '2026-11-13T01:00:00Z', duration: 50, total_damage: 5000, dps: 100, taken: T({ hits: 1, damageTaken: 5 }) }),
    ]);
    expect(n.map(x => x.night)).toEqual(['2026-11-11', '2026-11-12']);
    expect(n[0].fights).toBe(2);
    expect(n[0].dps).toBeCloseTo(190); // 19000 / 100s, a mean of DPS would say 550
    expect(n[0].bestDps).toBe(1000);
    expect(n[0].taken).toBeNull();
    expect(n[1].taken.fights).toBe(1);
  });
});

describe('dpsSpread', () => {
  it('finds best, worst and the median', () => {
    const s = dpsSpread([F({ dps: 50 }), F({ dps: 300 }), F({ dps: 100 }), F({ dps: 0 })]);
    expect(s.best.dps).toBe(300);
    expect(s.worst.dps).toBe(50);
    expect(s.typical).toBe(100);
  });
  it('is empty-safe', () => expect(dpsSpread([]).best).toBeNull());
});

describe('histograms', () => {
  it('merges element-wise', () => {
    const a = new Array(16).fill(0); a[3] = 2;
    const b = new Array(16).fill(0); b[3] = 1; b[5] = 4;
    const m = mergeHist([a, b, undefined, null]);
    expect(m[3]).toBe(3);
    expect(m[5]).toBe(4);
    expect(mergeHist([undefined])).toBeNull();
  });
  it('quantiles land in the right bucket and interpolate', () => {
    const h = new Array(16).fill(0); h[4] = 10; // 16..32
    expect(histQuantile(h, 0.5)).toBeCloseTo(24);
    expect(histQuantile(h, 1)).toBeCloseTo(32);
    const two = new Array(16).fill(0); two[2] = 5; two[8] = 5; // 4..8 and 256..512
    expect(histQuantile(two, 0.25)).toBeLessThan(8);
    expect(histQuantile(two, 0.75)).toBeGreaterThan(256);
    expect(histQuantile(two, 0.75)).toBeLessThan(512);
  });
  it('is null for empty or absent', () => {
    expect(histQuantile(null, 0.5)).toBeNull();
    expect(histQuantile(new Array(16).fill(0), 0.5)).toBeNull();
  });
});

describe('abilityTable', () => {
  const h1 = new Array(16).fill(0); h1[6] = 4; // 64..128
  const fights = [
    F({ by_skill: { 'flying kick': { hits: 10, dmg: 1000, max: 200, min: 10, h: h1 }, 'ds:thorns': { hits: 5, dmg: 100 } } }),
    F({ by_skill: { 'flying kick': { hits: 10, dmg: 3000, max: 400, min: 20 }, backstab: { hits: 1, dmg: 900 } } }),
  ];
  const t = abilityTable(fights);
  it('merges across fights and sorts by damage', () => {
    expect(t.map(a => a.key)).toEqual(['flying kick', 'backstab', 'ds:thorns']);
    const k = t[0];
    expect(k.hits).toBe(20);
    expect(k.dmg).toBe(4000);
    expect(k.mean).toBe(200);
    expect(k.max).toBe(400);
    expect(k.min).toBe(10);
  });
  it('shares add to 100 and ds is flagged', () => {
    expect(t.reduce((s, a) => s + a.sharePct, 0)).toBeCloseTo(100);
    expect(t[2].damageShield).toBe(true);
    expect(t[2].name).toBe('thorns');
  });
  it('median only when a histogram arrived', () => {
    expect(t[0].hasHist).toBe(true);
    expect(t[0].median).toBeGreaterThanOrEqual(64);
    expect(t[0].median).toBeLessThan(128);
    expect(t[1].hasHist).toBe(false);
    expect(t[1].median).toBeNull();
  });
  it('tolerates null by_skill', () => expect(abilityTable([F({ by_skill: null })])).toEqual([]));
});

describe('abilityShareByNight', () => {
  it('buckets the tail into other and each night sums to 100', () => {
    const fights = [
      F({ by_skill: { a: { hits: 1, dmg: 600 }, b: { hits: 1, dmg: 300 }, c: { hits: 1, dmg: 100 } } }),
      F({ started_at: '2026-11-13T01:00:00Z', by_skill: { a: { hits: 1, dmg: 100 }, c: { hits: 1, dmg: 100 } } }),
    ];
    const r = abilityShareByNight(fights, 2);
    expect(r.keys).toEqual(['a', 'b', 'other']);
    expect(r.nights[0].share.other).toBeCloseTo(10);
    expect(r.nights[1].share.a).toBeCloseTo(50);
    for (const n of r.nights) expect(Object.values(n.share).reduce((s, v) => s + v, 0)).toBeCloseTo(100);
  });
});

describe('harmTouch', () => {
  it('is null when no fight has the key', () => expect(harmTouch([F({ by_skill: { a: { hits: 1, dmg: 1 } } })])).toBeNull());
  it('counts and totals when present', () => {
    expect(harmTouch([
      F({ by_skill: { 'harm touch': { hits: 1, dmg: 20000 } } }),
      F({ by_skill: { 'harm touch': { hits: 2, dmg: 30000 } } }),
      F(),
    ])).toEqual({ count: 3, total: 50000, fights: 2 });
  });
});

describe('weave', () => {
  const w = (o = {}) => ({ rounds: 100, roundsWithSpecial: 50, specials: 60, avgRoundGapMs: 1000, lateRounds: 5, ...o });
  it('is null when no fight carries weave', () => {
    expect(summarizeWeave([F()])).toBeNull();
    expect(summarizeWeave([F({ weave: w({ rounds: 0 }) })])).toBeNull();
  });
  it('computes the percentages, rate and weighted gap', () => {
    const s = summarizeWeave([
      F({ duration: 60, weave: w() }),
      F({ duration: 60, weave: w({ rounds: 300, roundsWithSpecial: 150, specials: 60, lateRounds: 15, avgRoundGapMs: 2000 }) }),
    ]);
    expect(s.rounds).toBe(400);
    expect(s.specialRoundPct).toBeCloseTo(50);
    expect(s.lateRoundPct).toBeCloseTo(10); // 20 late / 200 with special
    expect(s.specialsPerMin).toBeCloseTo(60); // 120 specials / 2 min
    expect(s.avgRoundGapMs).toBeCloseTo(1750); // (100*1000 + 300*2000) / 400
  });
  it('splits per night and skips nights without weave', () => {
    const r = weaveByNight([
      F({ weave: w() }),
      F({ started_at: '2026-11-13T01:00:00Z' }),
    ]);
    expect(r.length).toBe(1);
    expect(r[0].night).toBe('2026-11-11');
  });
});

describe('inputs', () => {
  it('parseDays accepts 30, defaults to 90', () => {
    expect(parseDays('30')).toBe(30);
    expect(parseDays(['30'])).toBe(30);
    expect(parseDays('7')).toBe(90);
    expect(parseDays(undefined)).toBe(90);
  });
  it('cleanFights drops junk and sorts oldest first', () => {
    const r = cleanFights([F({ started_at: '2026-11-13T00:00:00Z' }), null, { started_at: 'bad' }, F({ started_at: '2026-11-12T00:00:00Z' })]);
    expect(r.map(f => f.started_at)).toEqual(['2026-11-12T00:00:00Z', '2026-11-13T00:00:00Z']);
    expect(cleanFights('x')).toEqual([]);
  });
});

describe('page metadata', () => {
  it('names the combat page, marked [beta], with no numbers', async () => {
    const { metaForPath } = await import('../web/lib/pageMeta.ts');
    const m = metaForPath('/character/Aldenmar/combat');
    expect(m.title).toBe('[beta] Aldenmar · Combat');
    expect(m.description).not.toMatch(/\d/);
  });
});
