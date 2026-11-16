// /pop/raid tiers (the guild lead, 2026-11-16): who is in, who lacks what, and "not recorded" is never "missing".
import { describe, it, expect } from 'vitest';
import { tierViews, tierSummary } from '../web/lib/popRaidTiers.ts';

const raiders = ['Aldenmar', 'Brackwyn', 'Corvale', 'Rethlan', 'Nyssara', 'Zarrin'].map(name => ({ name }));
const air = tiers => tiers.find(t => t.tier === 4).zones.find(z => z.key === 'air');

describe('tierViews', () => {
  it('orders tiers 5 down to 1, tier 1 without gates', () => {
    const t = tierViews(raiders, new Map(), new Set());
    expect(t.map(x => x.tier)).toEqual([5, 4, 3, 2, 1]);
    expect(t[4].zones).toEqual([]);
  });

  it('counts a raider holding the gate as in', () => {
    const held = new Map([['aldenmar', new Set(['zebuxoruk_2'])]]);
    const a = air(tierViews(raiders, held, new Set(['aldenmar'])));
    expect(a.inCount).toBe(1);
    expect(a.total).toBe(6);
    expect(tierSummary(tierViews(raiders, held, new Set(['aldenmar']))[1])).toContain('Air 1/6');
  });

  it('puts a full-read raider lacking a piece under that piece', () => {
    const a = air(tierViews(raiders, new Map(), new Set(['brackwyn'])));
    expect(a.missing.length).toBeGreaterThan(0);
    expect(a.missing.every(m => m.names.includes('Brackwyn'))).toBe(true);
    expect(a.inCount).toBe(0);
  });

  it('puts an unread raider with nothing recorded under not recorded, not missing', () => {
    const a = air(tierViews(raiders, new Map(), new Set(['brackwyn'])));
    expect(a.notRecorded).toContain('Corvale');
    expect(a.missing.some(m => m.names.includes('Corvale'))).toBe(false);
  });

  it('lists a sub-zone straight after its parent', () => {
    const keys = tierViews(raiders, new Map(), new Set())[3].zones.map(z => z.key);
    expect(keys.indexOf('codb')).toBe(keys.indexOf('cod') + 1);
  });
});
