// One character's card on raidmimic.com/characters: what its flags prove, and what it needs next. Reads the PoP
// "what's next" logic (web/lib/popNextSteps.ts), which takes plain catalog flag keys, so the hub rows feed it directly;
// nothing here reads pop_flags or any Wolf Pack table. Pure.

import { nextCard, nextSteps, type NextCard } from './popNextSteps';
import { stepLabel, stepZone } from './popFlagsPaste';
import { POP_FLAGS, POP_ZONES, POP_ZONE_BY_KEY, missingFor, zoneAccess } from './popFlags';
import { DEFAULT_GATE, gateReport } from './popGateStatus';
import type { GateTableRow, OverallRow } from '@/app/pop/guide/GateTable';
import { GATES } from './popGatePieces';
import { heldClosure } from './popRecital';

export type CharacterView = {
  name: string;
  proof: string;
  /** Distinct flag keys the character has (a re-upload at a new time repeats keys; they count once). */
  flagCount: number;
  next: NextCard;
  /** The flags it has, grouped by zone card in catalog order, each in plain words. */
  groups: { zone: string; labels: string[] }[];
  lastExport: string | null;
  /** The distinct catalog flag keys behind `flagCount`, for the matrix. */
  keys: string[];
  /** Every PoP zone in the chart's order: can this character enter it, and if not, which flags are missing (plain words). */
  zones: { key: string; name: string; open: boolean; missing: string[] }[];
};

/** The player's characters as rows of the gate matrix (the demo's GateTable, drawn from real flags): most flags first,
 *  ties by name. An upload or paste is a full read, so an absent flag reads as a real "no". */
export function matrixRows(views: CharacterView[], gateKey: string): GateTableRow[] {
  const zone = POP_ZONE_BY_KEY[gateKey] ?? POP_ZONE_BY_KEY[DEFAULT_GATE];
  return [...views]
    .sort((a, b) => b.flagCount - a.flagCount || a.name.localeCompare(b.name))
    .map(v => {
      const r = gateReport(zone, { flags: v.keys, fullRead: true });
      return { name: v.name, cls: null, isMain: true, pieces: r.pieces, verdict: r.verdict };
    });
}

/** The Overall view: each character across every gate (pieces done of total), most flags first, ties by name. */
export function overallRows(views: CharacterView[]): OverallRow[] {
  return [...views]
    .sort((a, b) => b.flagCount - a.flagCount || a.name.localeCompare(b.name))
    .map(v => ({
      name: v.name, flagCount: v.flagCount,
      gates: GATES.map(z => {
        const r = gateReport(z, { flags: v.keys, fullRead: true });
        return { key: z.key, short: z.short, done: r.pieces.filter(p => p.state === 'done').length, total: r.pieces.length };
      }),
    }));
}

/** True when the page should open on Overall: no ?gate=, ?gate=overall, or anything that is not a gate. */
export function wantsOverall(raw: unknown): boolean {
  return !(typeof raw === 'string' && GATES.some(g => g.key === raw));
}

/** The entry check per zone, on the flags the character has plus what each one implies (the same closure the Seer paste uses). */
export function zoneEntry(keys: string[]): CharacterView['zones'] {
  const held = heldClosure(keys);
  return POP_ZONES.map(z => ({
    key: z.key, name: z.short, open: zoneAccess(z, held),
    missing: missingFor(z, held).map(f => POP_FLAGS[f]?.label ?? f),
  }));
}

export function characterView(name: string, proof: string, rows: { flag_key: string; earned_at: string }[]): CharacterView {
  const keys = [...new Set(rows.map(r => r.flag_key))];
  const byZone = new Map<string, Set<string>>();
  for (const k of keys) {
    const z = stepZone(k);
    if (!byZone.has(z)) byZone.set(z, new Set());
    byZone.get(z)!.add(stepLabel(k));
  }
  const last = rows.reduce<string | null>((m, r) => (m === null || r.earned_at > m ? r.earned_at : m), null);
  return {
    name, proof,
    flagCount: keys.length,
    next: nextCard(nextSteps({ done: [], flags: keys })),
    groups: [...byZone.entries()].map(([zone, labels]) => ({ zone, labels: [...labels] })),
    lastExport: last,
    keys,
    zones: zoneEntry(keys),
  };
}
