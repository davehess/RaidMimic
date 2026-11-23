// /pop/raid by tier, highest first: for each gated plane, who is in and who lacks what (the guild lead, 2026-11-16:
// "split into tiers, starting from the highest tier and moving down ... high level 'who's missing what' per section").
// Pure, no database. The honesty rule is popGateStatus.ts's: without a full read an absent flag is 'unknown', so a
// raider with no recent read and nothing recorded lands in `notRecorded`, never under "missing".

import { POP_ZONES, TIER_LABELS, TIER_COLORS, type PopNode } from './popFlags';
import { gateReport } from './popGateStatus';
import { ENTRY_ZONES, doorLine, type DoorLine } from './popRaidEntry';

export type TierRaider = { name: string };
export type MissingBucket = { label: string; names: string[] };
export type ZoneView = {
  key: string; name: string; short: string; total: number; inCount: number;
  missing: MissingBucket[];     // pieces missing or pending, most names first
  notRecorded: string[];        // nothing missing for them, but some piece is unknown
  door: DoorLine | null;        // the raid-in door line, for every gated zone the server lets a raid into (ENTRY_ZONES)
};
export type TierView = { tier: number; name: string; color: string; zones: ZoneView[] };

const byCol = (a: PopNode, b: PopNode) => a.col - b.col;

/** Gated zones of a tier, each parent immediately followed by its sub-zones. */
function orderedGated(tier: number): PopNode[] {
  const gated = POP_ZONES.filter(z => z.tier === tier && z.requires.length > 0);
  const parents = gated.filter(z => !z.subZoneOf).sort(byCol);
  return parents.flatMap(p => [p, ...gated.filter(z => z.subZoneOf === p.key).sort(byCol)]);
}

export function zoneView(zone: PopNode, raiders: TierRaider[], held: Map<string, Set<string>>, fullRead: Set<string>): ZoneView {
  const buckets = new Map<string, string[]>();
  const notRecorded: string[] = [];
  let inCount = 0;
  for (const r of raiders) {
    const k = r.name.toLowerCase();
    const rep = gateReport(zone, { flags: held.get(k) ?? [], fullRead: fullRead.has(k) });
    const owed = rep.pieces.filter(p => p.state === 'missing' || p.state === 'pending');
    for (const p of owed) buckets.set(p.label, [...(buckets.get(p.label) ?? []), r.name]);
    if (owed.length) continue;
    if (rep.pieces.some(p => p.state === 'unknown')) notRecorded.push(r.name);
    else inCount++;
  }
  const missing = [...buckets].map(([label, names]) => ({ label, names }))
    .sort((a, b) => b.names.length - a.names.length || a.label.localeCompare(b.label));
  const door = ENTRY_ZONES[zone.key] ? doorLine(raiders.length, inCount, notRecorded.length) : null;
  return { key: zone.key, name: zone.name, short: zone.short, total: raiders.length, inCount, missing, notRecorded, door };
}

/** Tiers 5 down to 1; tier 1 has no gates so its zone list is empty. */
export function tierViews(raiders: TierRaider[], held: Map<string, Set<string>>, fullRead: Set<string>): TierView[] {
  return [5, 4, 3, 2, 1].map(tier => ({
    tier, name: TIER_LABELS[tier].name, color: TIER_COLORS[tier],
    zones: orderedGated(tier).map(z => zoneView(z, raiders, held, fullRead)),
  }));
}

/** "Air 21/40 · Water 21/40": the tier's parent zones at a glance. */
export function tierSummary(t: TierView): string {
  return t.zones.filter(z => !POP_ZONES.find(p => p.key === z.key)?.subZoneOf).map(z => `${z.short} ${z.inCount}/${z.total}`).join(' · ');
}
