// The pick list for "tonight's raid" on /raids (the guild lead, 2026-11-17, DECISIONS §629 item 6: "not just a single select, it
// should let you choose zones and/or bosses ... also other bosses in other expansions, sorted by expansion going backwards
// starting with PoP, then SoL, SoV, Kunark, Classic. then by zone"). PURE: no database, no framework.
//
// The zones and bosses are the boss catalog's (data/bosses.json), folded into raidCatalog.json by the same generator step that
// wrote it; test/my-raids.test.js fails if the two drift. The site imports nothing from outside web/, so the JSON is a copy.
//
// KEYS (stored in hub_player_targets.target_key, so never rename one): a PoP gate target keeps its flagTargets.ts key; a whole
// zone is `z:<slug>`; one boss is `b:<catalog id>`. A night may hold several, stored as one comma-separated string (the table's
// primary key is one row per entry and date); the column's length limit is lifted by the migration that ships with this.

import catalog from './raidCatalog.json';
import { FLAG_TARGETS, flagTargetByKey } from './flagTargets';

export type CatalogBoss = { id: string; name: string };
export type CatalogZone = { slug: string; name: string; bosses: CatalogBoss[] };
export type CatalogExpansion = { key: string; label: string; zones: CatalogZone[] };

/** Newest first: PoP, Luclin, Velious, Kunark, Classic. */
export const RAID_CATALOG = catalog as CatalogExpansion[];

/** Most keys one night may hold, and the longest stored string (the migration's limit). */
export const MAX_TARGET_KEYS = 12;
export const MAX_TARGET_STRING = 400;

const ZONES = new Map<string, CatalogZone>();
const BOSSES = new Map<string, CatalogBoss>();
for (const e of RAID_CATALOG) for (const z of e.zones) {
  ZONES.set(z.slug, z);
  for (const b of z.bosses) BOSSES.set(b.id, b);
}

export const zoneKey = (z: CatalogZone) => `z:${z.slug}`;
export const bossKey = (b: CatalogBoss) => `b:${b.id}`;

/** A key's words ("Plane of Justice", "Lord Nagafen", "Saryrn"), or null when the key is not in the catalog. */
export function keyLabel(key: string): string | null {
  if (key.startsWith('z:')) return ZONES.get(key.slice(2))?.name ?? null;
  if (key.startsWith('b:')) return BOSSES.get(key.slice(2))?.name ?? null;
  return flagTargetByKey(key)?.label ?? null;
}

/**
 * The keys in a stored string, or null if it is empty, too long, has an unknown key or repeats one. Never a partial list:
 * one bad key refuses the whole save.
 */
export function parseTargetKeys(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_TARGET_STRING) return null;
  const keys = raw.split(',');
  if (keys.length > MAX_TARGET_KEYS || new Set(keys).size !== keys.length) return null;
  return keys.every(k => keyLabel(k) !== null) ? keys : null;
}

/** "Plane of Justice + Lord Nagafen", or null for an unusable string. */
export function targetsLabel(raw: string | null | undefined): string | null {
  const keys = parseTargetKeys(raw);
  return keys ? keys.map(k => keyLabel(k)).join(' + ') : null;
}

/** The PoP gate targets (flagTargets.ts), offered at the top of the PoP section. */
export const GATE_TARGETS = FLAG_TARGETS.map(t => ({ key: t.key, label: t.label }));
