import { describe, it, expect } from 'vitest';
import { entryCheck, doorLine, ENTRY_ZONES, RAID_WILLING_PCT } from '../web/lib/popRaidEntry.ts';

// EQMacEmu 49e964b zone/zoning.cpp IsPopRaidWillingZone + PopRaidFlagRequirement (the patch of 2026-11-23: 85 became 50).
describe('entryCheck', () => {
  it('the percentage is the patch notes\' 50, not the old 85', () => {
    expect(RAID_WILLING_PCT).toBe(50);
    expect(entryCheck(20, 10).pass).toBe(true);
    expect(entryCheck(20, 9).pass).toBe(false);
  });
  it('max unflagged per raid size: 42->21, 48->24, 54->27, 60->30, 72->36', () => {
    for (const [size, maxUn] of [[42, 21], [48, 24], [54, 27], [60, 30], [72, 36]]) {
      expect(entryCheck(size, size - maxUn).pass).toBe(true);
      expect(entryCheck(size, size - maxUn - 1).pass).toBe(false);
      expect(entryCheck(size, size - maxUn).roomUnflagged).toBe(0);
    }
  });
  it('room and swaps', () => {
    const p = entryCheck(42, 37);
    expect(p).toMatchObject({ pass: true, flaggedPct: 88, needFlagged: 21, roomUnflagged: 16, swapOut: 0 });
    expect(entryCheck(42, 19)).toMatchObject({ pass: false, flaggedPct: 45, swapOut: 2, roomUnflagged: 0 });
  });
  it('edges: empty raid, one person, exact 50%', () => {
    expect(entryCheck(0, 0).pass).toBe(true);
    expect(entryCheck(1, 0)).toMatchObject({ pass: false, needFlagged: 1, swapOut: 1 });
    expect(entryCheck(1, 1).pass).toBe(true);
    expect(entryCheck(20, 10)).toMatchObject({ pass: true, flaggedPct: 50, roomUnflagged: 0 });
    expect(entryCheck(20, 9).pass).toBe(false);
  });
  it('clamps flagged to the raid', () => {
    expect(entryCheck(5, 9).flagged).toBe(5);
  });
});

describe('doorLine: the 50% line under a zone, with "not recorded" (2026-11-16)', () => {
  it('passes on known flags alone, with the room left', () => {
    expect(doorLine(42, 37, 3)).toEqual({ tone: 'pass', text: '50% door: 37/42 flagged · passes · room for 16 more unflagged' });
    expect(doorLine(20, 10, 0).text).toBe('50% door: 10/20 flagged · passes');
  });
  it('fails only when it fails even if every not-recorded raider is flagged', () => {
    expect(doorLine(42, 15, 3)).toEqual({ tone: 'fail', text: '50% door: 15/42 flagged · fails: 3 too many unflagged' });
  });
  it('says how many of the not recorded it hangs on', () => {
    // 15 known of 40, 15 not recorded: 20 needed, so 5 of the 15 must turn out flagged.
    expect(doorLine(40, 15, 15)).toEqual({ tone: 'depends', text: '50% door: 15/40 flagged · passes if 5 of the 15 not recorded are flagged' });
  });
  it('covers the server list: ids 200-212 and 214-223, never 213, from the chart keys', () => {
    // IsPopRaidWillingZone (EQMacEmu 49e964b zone/zoning.cpp). The chart has no zone for 201-206 or 223: they are not gated.
    const ids = new Set(Object.values(ENTRY_ZONES).map(z => z.id));
    expect([...ids].sort((a, b) => a - b)).toEqual([200, 207, 208, 209, 210, 211, 212, 214, 215, 216, 217, 218, 219, 220, 221, 222]);
    expect(ids.has(213)).toBe(false);
    for (const k of ['air', 'water', 'fire', 'earth', 'time', 'cod', 'codb', 'solro']) expect(ENTRY_ZONES[k], k).toBeTruthy();
  });
});
