// What the server's quest scripts do that the eqemu_* mirror does not hold, read for /db/npc/[id] and /db/item/[id].
// Tables: eqemu_script_spawns / eqemu_script_loot / eqemu_script_rewards (migration 20261119140000, loaded weekly by
// scripts/sync-script-tables.js). Seen drops for a mob: RPC npc_seen_drops (migration 20261119140100).
// Every loader fails soft: a missing table or RPC is an empty list, never a broken page. Counts and dates only.
import type { SupabaseClient } from '@supabase/supabase-js';

export type NpcSeenRow = {
  item_id: number; item_name: string | null; basis: 'observed' | 'probable';
  times_seen: number; last_seen: string | null; in_published: boolean;
};
export type NpcSeenDrop = {
  item_id: number; item_name: string; observed: number; probable: number;
  last_seen: string | null; in_db: boolean;
};

/** One row per item; observed and probable stay separate counts. Newest first. */
export function mergeNpcSeenDrops(rows: NpcSeenRow[]): NpcSeenDrop[] {
  const byItem = new Map<number, NpcSeenDrop>();
  for (const r of rows) {
    const cur = byItem.get(r.item_id) ?? {
      item_id: r.item_id, item_name: (r.item_name ?? '').trim(), observed: 0, probable: 0,
      last_seen: null as string | null, in_db: false,
    };
    cur[r.basis] += r.times_seen;
    if (r.last_seen && (!cur.last_seen || r.last_seen > cur.last_seen)) cur.last_seen = r.last_seen;
    cur.in_db = cur.in_db || r.in_published;
    if (!cur.item_name && r.item_name) cur.item_name = r.item_name.trim();
    byItem.set(r.item_id, cur);
  }
  return [...byItem.values()].sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''));
}

export async function loadNpcSeenDrops(sb: SupabaseClient, npcId: number): Promise<NpcSeenDrop[]> {
  try {
    const { data, error } = await sb.rpc('npc_seen_drops', { p_npc_id: npcId });
    if (error || !Array.isArray(data)) return [];
    return mergeNpcSeenDrops(data as NpcSeenRow[]);
  } catch { return []; }
}

export type ScriptSpawn = {
  zone_short: string; npc_id: number | null; npc_name: string | null; x: number | null; y: number | null; z: number | null;
  loc_kind: string | null; api: string | null; script_ref: string; trigger: string | null; is_ref: boolean;
};

/** Spawn calls for a mob (is_ref false) and the scripts that only mention it (is_ref true). */
export async function loadScriptSpawns(sb: SupabaseClient, npcId: number): Promise<{ spawns: ScriptSpawn[]; mentions: ScriptSpawn[] }> {
  try {
    const { data, error } = await sb.from('eqemu_script_spawns')
      .select('zone_short, npc_id, npc_name, x, y, z, loc_kind, api, script_ref, trigger, is_ref')
      .eq('npc_id', npcId).order('script_ref').limit(200);
    if (error || !Array.isArray(data)) return { spawns: [], mentions: [] };
    const rows = data as ScriptSpawn[];
    return { spawns: rows.filter(r => !r.is_ref), mentions: rows.filter(r => r.is_ref) };
  } catch { return { spawns: [], mentions: [] }; }
}

export type ScriptLoot = { zone_short: string; npc_id: number | null; item_id: number; item_name: string | null; script_ref: string; how: string | null };

export async function loadScriptLootForNpc(sb: SupabaseClient, npcId: number): Promise<ScriptLoot[]> {
  try {
    const { data, error } = await sb.from('eqemu_script_loot')
      .select('zone_short, npc_id, item_id, item_name, script_ref, how').eq('npc_id', npcId).limit(100);
    return error || !Array.isArray(data) ? [] : data as ScriptLoot[];
  } catch { return []; }
}

export async function loadScriptLootForItem(sb: SupabaseClient, itemId: number): Promise<ScriptLoot[]> {
  try {
    const { data, error } = await sb.from('eqemu_script_loot')
      .select('zone_short, npc_id, item_id, item_name, script_ref, how').eq('item_id', itemId).limit(100);
    return error || !Array.isArray(data) ? [] : data as ScriptLoot[];
  } catch { return []; }
}

export type GivesFor = { item_id: number; qty: number };
export type ScriptReward = {
  zone_short: string; npc_id: number | null; npc_name: string | null; kind: string;
  item_id: number | null; item_name: string | null; choice: boolean; exp: number | null;
  coin: Record<string, number> | null; gives_for: GivesFor[] | null; script_ref: string;
};
const REWARD_COLS = 'zone_short, npc_id, npc_name, kind, item_id, item_name, choice, exp, coin, gives_for, script_ref';

/** Script files are named for the mob with spaces for underscores and no leading '#'; the catalog name is the same up to that. */
export const scriptNameKey = (name: string | null | undefined): string =>
  (name ?? '').replace(/^#/, '').replace(/_/g, ' ').trim().toLowerCase();

export async function loadRewardsForItem(sb: SupabaseClient, itemId: number): Promise<ScriptReward[]> {
  try {
    const { data, error } = await sb.from('eqemu_script_rewards').select(REWARD_COLS).eq('item_id', itemId).limit(100);
    return error || !Array.isArray(data) ? [] : data as ScriptReward[];
  } catch { return []; }
}

/** Rewards an NPC hands out: rows carrying its id, plus rows named by script file in the mob's own zone. */
export async function loadRewardsForNpc(sb: SupabaseClient, npcId: number, npcName: string | null): Promise<ScriptReward[]> {
  try {
    const byId = sb.from('eqemu_script_rewards').select(REWARD_COLS).eq('npc_id', npcId).limit(100);
    const key = scriptNameKey(npcName);
    const zoneRes = await sb.from('eqemu_zone').select('short_name').eq('zone_id', Math.floor(npcId / 1000)).maybeSingle();
    const zone = (zoneRes.data as { short_name: string } | null)?.short_name;
    const byName = key && zone
      ? sb.from('eqemu_script_rewards').select(REWARD_COLS).is('npc_id', null).eq('zone_short', zone).ilike('npc_name', key.replace(/[%_]/g, m => '\\' + m)).limit(100)
      : Promise.resolve({ data: [], error: null });
    const [a, b] = await Promise.all([byId, byName]);
    const rows = [...((a.data ?? []) as ScriptReward[]), ...((b.data ?? []) as ScriptReward[])];
    return rows;
  } catch { return []; }
}

/** 'give A x2, B' for a reward's hand-in, using names the caller resolved. */
export function handInLabel(g: GivesFor[] | null, nameOf: (id: number) => string): string {
  return (g ?? []).map(x => (x.qty > 1 ? `${nameOf(x.item_id)} ×${x.qty}` : nameOf(x.item_id))).join(', ');
}
