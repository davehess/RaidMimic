// "Can this raid zone in?" for the Planes of Power zones whose door lets a raid in with some members unflagged.
// The rule is read from Quarm's server source (EQMacEmu 49e964b zone/zoning.cpp IsPopRaidWillingZone and
// PopRaidFlagRequirement, zone/raids.cpp MeetsFlagRequirement; DECISIONS §596): for the zone ids below a raid member
// without the zone's flag may still enter when flagged x 100 >= raid size x RAID_WILLING_PCT, counting EVERY member of
// the raid wherever they stand. Getting in this way sets no flag, so it never counts as flagged. Pure, so the page and
// the tests share one answer.
// Two server settings sit behind it and are live data we cannot read: the door works only while the data bucket
// pop_alt_access_enabled is "1", and the percentage is the bucket pop_raid_flagged_percent. 50 is the 2026-11-23 patch
// notes' value (it was 85); the server can change it with no patch. Keep the agent's RAID_WILLING_PCT the same
// (packages/wolfpack-logsync/index.js).

export const RAID_WILLING_PCT = 50;

export type EntryCheck = {
  pass: boolean;
  size: number;
  flagged: number;
  flaggedPct: number;        // whole percent, rounded down (50.1 shows as 50; 50 exactly shows 50)
  needFlagged: number;       // the fewest flagged members that pass: ceil(RAID_WILLING_PCT% x size)
  /** pass: how many more unflagged members could join. fail: 0. */
  roomUnflagged: number;
  /** fail: how many unflagged members must be swapped for flagged ones. pass: 0. */
  swapOut: number;
};

export function entryCheck(size: number, flagged: number): EntryCheck {
  const n = Math.max(0, Math.floor(size));
  const f = Math.min(n, Math.max(0, Math.floor(flagged)));
  const needFlagged = Math.floor((n * RAID_WILLING_PCT + 99) / 100);
  const pass = f * 100 >= n * RAID_WILLING_PCT;
  return {
    pass, size: n, flagged: f,
    flaggedPct: n ? Math.floor((f * 100) / n) : 100,
    needFlagged,
    roomUnflagged: pass ? f - needFlagged : 0,
    swapOut: pass ? 0 : needFlagged - f,
  };
}

/**
 * The zones with this door, by chart key (web/lib/popFlags.ts POP_ZONES): server zone id and name. The server list is
 * ids 200-212 and 214-223 (213 is not in it); the chart's zones are the ones below, and only the gated ones draw a line.
 */
export const ENTRY_ZONES: Record<string, { id: number; name: string }> = {
  cod: { id: 200, name: 'Crypt of Decay' },
  codb: { id: 200, name: 'Crypt of Decay (lower)' },
  torment: { id: 207, name: 'Plane of Torment' },
  valor: { id: 208, name: 'Plane of Valor' },
  bot: { id: 209, name: 'Bastion of Thunder' },
  storms: { id: 210, name: 'Plane of Storms' },
  hoh: { id: 211, name: 'Halls of Honor' },
  solro: { id: 212, name: 'Tower of Solusek Ro' },
  tactics: { id: 214, name: 'Plane of Tactics' },
  air: { id: 215, name: 'Plane of Air' },
  water: { id: 216, name: 'Plane of Water' },
  fire: { id: 217, name: 'Plane of Fire' },
  earth: { id: 218, name: 'Plane of Earth' },
  time: { id: 219, name: 'Plane of Time' },
  hohb: { id: 220, name: 'Temple of Marr' },
  ponb: { id: 221, name: 'Lair of Terris Thule' },
  poeb: { id: 222, name: 'Ragrax, Stronghold of the Twelve' },
};

export type DoorLine = { tone: 'pass' | 'fail' | 'depends'; text: string };

/**
 * The door line under a plane on /pop/raid (the guild lead, 2026-11-16: bring it back inside the tiers, with the same
 * "not recorded" rule). `flagged` are the raiders known to hold the gate; `notRecorded` could go either way, so the
 * line only says passes or fails when the answer holds whichever way they turn out.
 */
export function doorLine(size: number, flagged: number, notRecorded: number): DoorLine {
  const sure = entryCheck(size, flagged);
  const head = `${RAID_WILLING_PCT}% door: ${sure.flagged}/${sure.size} flagged`;
  if (sure.pass) {
    return { tone: 'pass', text: `${head} · passes${sure.roomUnflagged ? ` · room for ${sure.roomUnflagged} more unflagged` : ''}` };
  }
  const best = entryCheck(size, flagged + notRecorded);
  if (!best.pass) return { tone: 'fail', text: `${head} · fails: ${best.swapOut} too many unflagged` };
  return { tone: 'depends', text: `${head} · passes if ${sure.swapOut} of the ${notRecorded} not recorded are flagged` };
}
