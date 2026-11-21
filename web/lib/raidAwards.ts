// The awards card of a raid review: the top three raiders in a few categories, from rows the loader already holds
// (lib/raidAwardsLoad.ts). Pure: no React, no Supabase.
//
// Every category counts what Mimic users reported, so it is a count of what was SEEN. A name that is opted out
// is shown as its label ("Cleric 2"), exactly as the rest of the page shows it (raidSession.ts anonName).
import { anonName, nameKey, type AnonMap, type PlayerIn } from './raidSession';

export type AwardRow = { name: string; value: number };
/** fmt: 'dmg' is a damage figure (1.15M), 'n' a plain count. */
export type Award = { key: string; title: string; fmt: 'dmg' | 'n'; rows: AwardRow[] };

export type TakenIn = { encounter_id: string; character_name: string; dmg: string | number | null };
export type CastIn = { caster: string; spell: string; cast_at: string };
export type TargetIn = { character: string; target_name: string | null; at: string };

/** One cluster of a target's name ends after this long with nobody reporting it targeted. */
export const TARGET_GAP_MS = 120_000;
/** Each award carries EVERY raider with a value, sorted; the card shows this many until "show all". */
export const TOP_N = 3;

/** The resurrection spells (SPA 81), as the catalog names them, when the catalog cannot be read. "Customer Service Resurrect" is a GM tool. */
export const REZ_FALLBACK = [
  'Resuscitate', 'Revive', 'Resurrection', 'Reviviscence', 'Convergence', 'Reanimation', 'Reconstitution', 'Reparation',
  'Renewal', 'Restoration', 'Divine Resurrection',
];

export type AwardsInput = {
  /** The window's encounter_players rows (already cut to the raid the page is narrowed to). */
  players: readonly PlayerIn[];
  taken: readonly TakenIn[];
  /** Deaths per name, deduplicated by the caller (nightSlicesLoad), already cut to the raid. */
  deaths: readonly { name: string; n: number }[];
  casts: readonly CastIn[];
  targets: readonly TargetIn[];
  /** Lowercase spell names that raise a corpse. */
  rezSpells: ReadonlySet<string>;
  /** nameKeys of everyone known to be a player in the window: a target with one of these names is not a mob. */
  roster: ReadonlySet<string>;
  anon: AnonMap;
  /** Keeps a row of `name` at `atMs` (the raid the page is narrowed to). Absent: keeps everything. */
  keep?: (name: string, atMs: number) => boolean;
};

const PET = /`s\s+(pet|warder|ward|familiar|companion)$/i;
const CORPSE = /'s corpse\d*$/i;

class Tally {
  private m = new Map<string, { name: string; n: number }>();
  add(name: string, n = 1) {
    const k = nameKey(name);
    if (!k) return;
    const cur = this.m.get(k);
    if (cur) cur.n += n; else this.m.set(k, { name: name.trim(), n });
  }
  top(anon: AnonMap): AwardRow[] {
    return [...this.m.values()]
      .filter(e => e.n > 0)
      .map(e => ({ name: anonName(anon, e.name), value: e.n }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));   // ties on the SHOWN name, never a real one behind a label
  }
}

const ms = (iso: string) => Date.parse(iso);

export function buildAwards(i: AwardsInput): Award[] {
  const keep = i.keep ?? (() => true);

  const damage = new Tally();
  for (const p of i.players) {
    if (typeof p.total_damage === 'number' && p.total_damage > 0 && !PET.test(String(p.character_name).trim())) damage.add(p.character_name, p.total_damage);
  }

  // Several submitters report the same fight: one figure per (fight, character), the largest.
  const peak = new Map<string, { name: string; n: number }>();
  for (const t of i.taken) {
    const n = Number(t.dmg);
    if (!Number.isFinite(n) || n <= 0 || PET.test(String(t.character_name).trim())) continue;
    const k = `${t.encounter_id}|${nameKey(t.character_name)}`;
    const cur = peak.get(k);
    if (!cur || n > cur.n) peak.set(k, { name: t.character_name, n });
  }
  const taken = new Tally();
  for (const v of peak.values()) taken.add(v.name, v.n);

  const deaths = new Tally();
  for (const d of i.deaths) deaths.add(d.name, d.n);

  const spells = new Tally(), rez = new Tally(), di = new Tally();
  for (const c of i.casts) {
    const t = ms(c.cast_at);
    if (!Number.isFinite(t) || !c.caster || !keep(c.caster, t)) continue;
    spells.add(c.caster);
    const s = String(c.spell ?? '').trim().toLowerCase();
    if (i.rezSpells.has(s)) rez.add(c.caster);
    if (s === 'divine intervention') di.add(c.caster);
  }

  // First on target: per target name, a new cluster starts when nobody reported it for TARGET_GAP_MS, and the earliest
  // character in the cluster takes it. Players (anyone on the roster, casting or reporting) and corpses are not mobs.
  const players = new Set(i.roster);
  for (const c of i.casts) players.add(nameKey(c.caster));
  for (const t of i.targets) players.add(nameKey(t.character));
  for (const p of i.players) players.add(nameKey(p.character_name));
  const first = new Tally();
  const last = new Map<string, number>();
  const rows = i.targets
    .map(t => ({ ...t, t: ms(t.at) }))
    .filter(t => Number.isFinite(t.t))
    .sort((a, b) => a.t - b.t);
  for (const r of rows) {
    const tn = String(r.target_name ?? '').trim();
    if (!tn || CORPSE.test(tn) || players.has(nameKey(tn)) || !keep(r.character, r.t)) continue;
    const k = tn.toLowerCase();
    const prev = last.get(k);
    last.set(k, r.t);
    if (prev == null || r.t - prev > TARGET_GAP_MS) first.add(r.character);
  }

  const all: Award[] = [
    { key: 'damage', title: 'Most damage', fmt: 'dmg', rows: damage.top(i.anon) },
    { key: 'taken', title: 'Most damage taken', fmt: 'dmg', rows: taken.top(i.anon) },
    { key: 'deaths', title: 'Most deaths', fmt: 'n', rows: deaths.top(i.anon) },
    { key: 'spells', title: 'Most spells cast', fmt: 'n', rows: spells.top(i.anon) },
    { key: 'rez', title: 'Rez casts', fmt: 'n', rows: rez.top(i.anon) },
    { key: 'di', title: 'Divine Intervention', fmt: 'n', rows: di.top(i.anon) },
    { key: 'first', title: 'First on target', fmt: 'n', rows: first.top(i.anon) },
  ];
  return all.filter(a => a.rows.length > 0);
}

/** The nameKeys on a recording's minute rows' `who` lists: everyone the recording placed in the raid. */
export function rosterKeys(rows: readonly { data: string }[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    let d: { who?: unknown };
    try { d = JSON.parse(r.data); } catch { continue; }
    if (!d || !Array.isArray(d.who)) continue;
    for (const w of d.who as unknown[]) if (Array.isArray(w) && typeof w[0] === 'string') out.add(nameKey(w[0]));
  }
  return out;
}
