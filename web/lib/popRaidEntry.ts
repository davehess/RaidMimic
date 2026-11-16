// "Can this raid zone in?" for the five planes whose door lets a raid in with some members unflagged.
// The rule is read from Quarm's server source (EQMacEmu zone/zoning.cpp:41-73 and zone/raids.cpp:617-638;
// DECISIONS §596): for zone ids 215-219 a raid member without the zone's flag may still enter when
// flagged x 100 >= raid size x 85, counting EVERY member of the raid wherever they stand. Getting in this way
// sets no flag. Pure, so the page and the tests share one answer.

export type EntryCheck = {
  pass: boolean;
  size: number;
  flagged: number;
  flaggedPct: number;        // whole percent, rounded down (88.1 shows as 88; 85 exactly shows 85)
  needFlagged: number;       // the fewest flagged members that pass: ceil(0.85 x size)
  /** pass: how many more unflagged members could join. fail: 0. */
  roomUnflagged: number;
  /** fail: how many unflagged members must be swapped for flagged ones. pass: 0. */
  swapOut: number;
};

export function entryCheck(size: number, flagged: number): EntryCheck {
  const n = Math.max(0, Math.floor(size));
  const f = Math.min(n, Math.max(0, Math.floor(flagged)));
  const needFlagged = Math.floor((n * 85 + 99) / 100);
  const pass = f * 100 >= n * 85;
  return {
    pass, size: n, flagged: f,
    flaggedPct: n ? Math.floor((f * 100) / n) : 100,
    needFlagged,
    roomUnflagged: pass ? f - needFlagged : 0,
    swapOut: pass ? 0 : needFlagged - f,
  };
}

/** The planes with this door, by chart key (web/lib/popFlags.ts POP_ZONES): server zone id and name. */
export const ENTRY_ZONES: Record<string, { id: number; name: string }> = {
  air: { id: 215, name: 'Plane of Air' },
  water: { id: 216, name: 'Plane of Water' },
  fire: { id: 217, name: 'Plane of Fire' },
  earth: { id: 218, name: 'Plane of Earth' },
  time: { id: 219, name: 'Plane of Time' },
};

export type DoorLine = { tone: 'pass' | 'fail' | 'depends'; text: string };

/**
 * The door line under a plane on /pop/raid (the guild lead, 2026-11-16: bring it back inside the tiers, with the same
 * "not recorded" rule). `flagged` are the raiders known to hold the gate; `notRecorded` could go either way, so the
 * line only says passes or fails when the answer holds whichever way they turn out.
 */
export function doorLine(size: number, flagged: number, notRecorded: number): DoorLine {
  const sure = entryCheck(size, flagged);
  const head = `85% door: ${sure.flagged}/${sure.size} flagged`;
  if (sure.pass) {
    return { tone: 'pass', text: `${head} · passes${sure.roomUnflagged ? ` · room for ${sure.roomUnflagged} more unflagged` : ''}` };
  }
  const best = entryCheck(size, flagged + notRecorded);
  if (!best.pass) return { tone: 'fail', text: `${head} · fails: ${best.swapOut} too many unflagged` };
  return { tone: 'depends', text: `${head} · passes if ${sure.swapOut} of the ${notRecorded} not recorded are flagged` };
}
