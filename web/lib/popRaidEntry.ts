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

/** The zones with this door: short name -> server zone id, display name and the flag step the page checks. */
export const ENTRY_ZONES: Record<string, { id: number; name: string; flag: string }> = {
  poair: { id: 215, name: 'Plane of Air', flag: 'zebuxoruk_2' },
  powater: { id: 216, name: 'Plane of Water', flag: 'zebuxoruk_2' },
  pofire: { id: 217, name: 'Plane of Fire', flag: 'pofire_2' },
  poeartha: { id: 218, name: 'Plane of Earth', flag: 'zebuxoruk_2' },
  potimea: { id: 219, name: 'Plane of Time', flag: 'time_1' },
};

/** The one line a zone shows: "Plane of Air: 37 of 42 flagged (88%) · passes · room for 1 more unflagged". */
export function entryLine(name: string, c: EntryCheck): string {
  const head = `${name}: ${c.flagged} of ${c.size} flagged (${c.flaggedPct}%)`;
  if (c.pass) {
    return `${head} · passes · ${c.roomUnflagged === 0 ? 'no room for another unflagged' : `room for ${c.roomUnflagged} more unflagged`}`;
  }
  return `${head} · fails: ${c.swapOut} too many unflagged`;
}

export type EntryZoneView = { id: string; name: string; check: EntryCheck; line: string; unflagged: string[] };

/** One view per plan section whose zone has this door. Sections of any other zone are skipped. */
export function entryViews(
  sections: { id: string; zone: string }[],
  raiders: { name: string }[],
  has: (name: string, key: string) => boolean,
): EntryZoneView[] {
  const out: EntryZoneView[] = [];
  for (const s of sections) {
    const z = ENTRY_ZONES[s.zone];
    if (!z) continue;
    const unflagged = raiders.filter(r => !has(r.name, z.flag)).map(r => r.name);
    const check = entryCheck(raiders.length, raiders.length - unflagged.length);
    out.push({ id: s.id, name: z.name, check, line: entryLine(z.name, check), unflagged });
  }
  return out;
}
