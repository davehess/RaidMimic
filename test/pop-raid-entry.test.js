import { describe, it, expect } from 'vitest';
import { entryCheck, entryLine, entryViews, ENTRY_ZONES } from '../web/lib/popRaidEntry.ts';

describe('entryCheck', () => {
  it('max unflagged per raid size: 42->6, 48->7, 54->8, 60->9, 72->10', () => {
    for (const [size, maxUn] of [[42, 6], [48, 7], [54, 8], [60, 9], [72, 10]]) {
      expect(entryCheck(size, size - maxUn).pass).toBe(true);
      expect(entryCheck(size, size - maxUn - 1).pass).toBe(false);
      expect(entryCheck(size, size - maxUn).roomUnflagged).toBe(0);
    }
  });
  it('room and swaps', () => {
    const p = entryCheck(42, 37);
    expect(p).toMatchObject({ pass: true, flaggedPct: 88, needFlagged: 36, roomUnflagged: 1, swapOut: 0 });
    expect(entryCheck(42, 34)).toMatchObject({ pass: false, flaggedPct: 80, swapOut: 2, roomUnflagged: 0 });
  });
  it('edges: empty raid, one person, exact 85%', () => {
    expect(entryCheck(0, 0).pass).toBe(true);
    expect(entryCheck(1, 0)).toMatchObject({ pass: false, needFlagged: 1, swapOut: 1 });
    expect(entryCheck(1, 1).pass).toBe(true);
    expect(entryCheck(20, 17)).toMatchObject({ pass: true, flaggedPct: 85, roomUnflagged: 0 });
    expect(entryCheck(20, 16).pass).toBe(false);
  });
  it('clamps flagged to the raid', () => {
    expect(entryCheck(5, 9).flagged).toBe(5);
  });
});

describe('entryLine / entryViews', () => {
  it('writes both shapes', () => {
    expect(entryLine('Plane of Air', entryCheck(42, 37))).toBe('Plane of Air: 37 of 42 flagged (88%) · passes · room for 1 more unflagged');
    expect(entryLine('Plane of Air', entryCheck(42, 34))).toBe('Plane of Air: 34 of 42 flagged (80%) · fails: 2 too many unflagged');
  });
  it('only plan zones with this door get a view, with the unflagged names', () => {
    const raiders = ['Aldenmar', 'Brackwyn', 'Corvale'].map(name => ({ name }));
    const has = (n) => n !== 'Corvale';
    const v = entryViews([{ id: 'a', zone: 'podisease' }, { id: 'b', zone: 'poair' }], raiders, has);
    expect(v).toHaveLength(1);
    expect(v[0].unflagged).toEqual(['Corvale']);
    expect(v[0].check.pass).toBe(false);
    expect(Object.values(ENTRY_ZONES).map(z => z.id).sort()).toEqual([215, 216, 217, 218, 219]);
  });
});
