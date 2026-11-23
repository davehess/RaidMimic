// The reads behind the awards card (lib/raidAwards.ts). Server-side, service-role client; the members' page only.
//
// THREE new reads, all in parallel, each paged through selectAll on a unique order, few columns:
//   * raid_casts           caster, spell, cast_at   windowed: cast_at >= from and < to
//   * target_observations  character, target_name, at   windowed: at >= from and < to
//   * encounter_combat_rollup  encounter_id, character_name, taken->>damageTaken   no time column of its own, so only
//                          for the ids of the fights the review kept (chunked, like encounter_players)
// Damage and deaths come from rows the review (raidSessionLoad.ts awardsIn) and the night marks (nightSlicesLoad.ts
// deathCounts) already hold. The resurrection spell names are read from the catalog once per process (SPA 81).
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from './selectAll';
import { GUILD_TAG } from './guild';
import { chunk } from './replayBosses';
import { windowIso, type ShareWindow } from './raidShare';
import { anonSig, nameKey } from './raidSession';
import { inGroupAt } from './sessionGroups';
import { buildAwards, REZ_FALLBACK, type Award, type CastIn, type TakenIn, type TargetIn } from './raidAwards';
import type { AwardsSource } from './raidSessionLoad';

const ID_CHUNK = 40;
const CACHE_MS = 2 * 60_000;
const cache = new Map<string, { at: number; value: Award[] }>();

let rezSet: Promise<Set<string>> | null = null;
/** Lowercase names of the spells that resurrect (an effect slot of SPA 81), minus the GM tool. Read once; the fallback list if the read fails. */
export function loadRezSpells(sb: SupabaseClient): Promise<Set<string>> {
  rezSet ??= (async () => {
    try {
      const rows = await selectAll<{ id: number; name: string }>((from, to) => sb.from('eqemu_spells')
        .select('id, name')
        .or('effect_id_1.eq.81,effect_id_2.eq.81,effect_id_3.eq.81')
        .order('id')
        .range(from, to));
      const names = rows.map(r => String(r.name ?? '').trim().toLowerCase()).filter(n => n && !n.startsWith('customer service'));
      return new Set(names.length ? names : REZ_FALLBACK.map(n => n.toLowerCase()));
    } catch {
      rezSet = null;   // try again next time
      return new Set(REZ_FALLBACK.map(n => n.toLowerCase()));
    }
  })();
  return rezSet;
}

/** The window's awards. `src` is the review's `awardsIn`; `deathCounts` the night marks'. A failed read is no awards, never a failed page. */
export async function loadAwards(
  sb: SupabaseClient, win: ShareWindow, src: AwardsSource, deathCounts: readonly { name: string; n: number }[],
): Promise<Award[]> {
  const key = `${anonSig(src.anon)}|${win.fromMs}|${win.toMs}|${src.scope?.group ?? ''}|${src.encounterIds.length}|${deathCounts.length}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { from: lo, to: hi } = windowIso(win);
  const [casts, targets, taken, rezSpells] = await Promise.all([
    selectAll<CastIn & { id: number }>((from, to) => sb.from('raid_casts')
      .select('id, caster, spell, cast_at')
      .eq('guild_id', GUILD_TAG)
      .gte('cast_at', lo).lt('cast_at', hi)
      .order('id')
      .range(from, to)),
    selectAll<TargetIn & { id: number }>((from, to) => sb.from('target_observations')
      .select('id, character, target_name, at')
      .eq('guild_id', GUILD_TAG)
      .gte('at', lo).lt('at', hi)
      .order('id')
      .range(from, to)),
    Promise.all(chunk(src.encounterIds, ID_CHUNK).map(ids => selectAll<TakenIn & { id: string }>((from, to) => sb.from('encounter_combat_rollup')
      .select('id, encounter_id, character_name, dmg:taken->>damageTaken')
      .eq('guild_id', GUILD_TAG)
      .in('encounter_id', ids)
      .order('id')
      .range(from, to)))).then(parts => parts.flat()),
    loadRezSpells(sb),
  ]);
  const { scope } = src;
  const value = buildAwards({
    players: src.players, taken, deaths: deathCounts, casts, targets, rezSpells, roster: src.roster, anon: src.anon,
    keep: scope ? (name, atMs) => inGroupAt(scope.index, scope.group, nameKey(name), atMs) : undefined,
  });
  if (cache.size >= 10) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return value;
}
