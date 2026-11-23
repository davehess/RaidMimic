// Seen drops for /db/item/[id]: where OUR raids have seen an item drop, next to the published table.
// Rows come from the item_seen_drops RPC (supabase/migrations/20261119120000_item_seen_drops.sql).
// 'observed' = an award that named the mob; 'probable' = a raid-chat link right after one kill (time
// correlation only). Never member or character names: counts and dates.
import type { SupabaseClient } from '@supabase/supabase-js';

export type SeenDropRow = {
  npc_id: number; npc_name: string | null; basis: 'observed' | 'probable';
  times_seen: number; last_seen: string | null; in_published: boolean;
};
export type SeenDrop = {
  npc_id: number; npc_name: string; observed: number; probable: number;
  last_seen: string | null; in_published: boolean;
};

/** One row per mob: the two bases stay as separate counts so the page can say which is which. */
export function mergeSeenDrops(rows: SeenDropRow[]): SeenDrop[] {
  const byNpc = new Map<number, SeenDrop>();
  for (const r of rows) {
    const cur = byNpc.get(r.npc_id) ?? {
      npc_id: r.npc_id, npc_name: (r.npc_name ?? '').trim(), observed: 0, probable: 0,
      last_seen: null as string | null, in_published: false,
    };
    cur[r.basis] += r.times_seen;
    if (r.last_seen && (!cur.last_seen || r.last_seen > cur.last_seen)) cur.last_seen = r.last_seen;
    cur.in_published = cur.in_published || r.in_published;
    if (!cur.npc_name && r.npc_name) cur.npc_name = r.npc_name.trim();
    byNpc.set(r.npc_id, cur);
  }
  return [...byNpc.values()].sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''));
}

/** Fails soft: a missing RPC (migration not applied) or a read error is an empty list, never a broken page. */
export async function loadSeenDrops(sb: SupabaseClient, itemId: number, itemName: string | null): Promise<SeenDrop[]> {
  if (!itemName) return [];
  try {
    const { data, error } = await sb.rpc('item_seen_drops', { p_item_id: itemId, p_item_name: itemName }).limit(100);   // the function ends in LIMIT 100
    if (error || !Array.isArray(data)) return [];
    return mergeSeenDrops(data as SeenDropRow[]);
  } catch { return []; }
}
