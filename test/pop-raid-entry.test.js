import { describe, it, expect } from 'vitest';
import { entryCheck, doorLine, ENTRY_ZONES } from '../web/lib/popRaidEntry.ts';

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

describe('doorLine: the 85% line under a plane, with "not recorded" (2026-11-16)', () => {
  it('passes on known flags alone, with the room left', () => {
    expect(doorLine(42, 37, 3)).toEqual({ tone: 'pass', text: '85% door: 37/42 flagged · passes · room for 1 more unflagged' });
    expect(doorLine(20, 17, 0).text).toBe('85% door: 17/20 flagged · passes');
  });
  it('fails only when it fails even if every not-recorded raider is flagged', () => {
    expect(doorLine(42, 30, 3)).toEqual({ tone: 'fail', text: '85% door: 30/42 flagged · fails: 3 too many unflagged' });
  });
  it('says how many of the not recorded it hangs on', () => {
    // 21 known of 40, 15 not recorded: 34 needed, so 13 of the 15 must turn out flagged.
    expect(doorLine(40, 21, 15)).toEqual({ tone: 'depends', text: '85% door: 21/40 flagged · passes if 13 of the 15 not recorded are flagged' });
  });
  it('covers Air, Water, Fire, Earth and Time by chart key', () => {
    expect(Object.keys(ENTRY_ZONES).sort()).toEqual(['air', 'earth', 'fire', 'time', 'water']);
    expect(Object.values(ENTRY_ZONES).map(z => z.id).sort()).toEqual([215, 216, 217, 218, 219]);
  });
});
