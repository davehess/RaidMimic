// The hub_inventory reads and writes (supabase/migrations/20261115230000_hub_inventory.sql), taking the service-role
// client as an argument so a test can hand it a fake. EVERY statement here filters on `player_id`, the session player's id;
// a character name only narrows within that player's rows, so another player holding the same name is never read or
// touched. Failures read as "none yet" / an error string, never an exception.
import { selectAll } from './selectAll';
import type { InvRow, InvSource } from './hubInventory';

// Only the chain the code uses, so a fake stays small.
type Db = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any

const CHUNK = 300;

/** Write one (player, character, source) set, then drop that set's rows from an earlier upload. */
export async function replaceRows(db: Db, playerId: string, nameLc: string, character: string, source: InvSource, observedAt: string, rows: InvRow[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map(r => ({
      player_id: playerId, character, name_lc: nameLc, source, observed_at: observedAt,
      slot_label: r.slot_label, item_id: r.item_id, item_name: r.item_name, quantity: r.quantity,
    }));
    const { error } = await db.from('hub_inventory').upsert(batch, { onConflict: 'player_id,name_lc,source,slot_label' });
    if (error) return String(error.message ?? 'error');
  }
  const { error } = await db.from('hub_inventory').delete().eq('player_id', playerId).eq('name_lc', nameLc).eq('source', source).lt('observed_at', observedAt);
  return error ? String(error.message ?? 'error') : null;
}

export type StoredItem = { slot_label: string; item_id: number | null; item_name: string; quantity: number };
export type StoredInventory = { source: InvSource; observedAt: string; items: StoredItem[] }[];

/** This player's stored sets for one character, newest first. */
export async function loadInventory(db: Db, playerId: string, nameLc: string): Promise<StoredInventory> {
  try {
    // Past the gateway's 1,000-row cap (two sources can hold 1,200), ordered on the unique id.
    const data = await selectAll<Record<string, unknown>>((from, to) => db.from('hub_inventory')
      .select('source, slot_label, item_id, item_name, quantity, observed_at')
      .eq('player_id', playerId).eq('name_lc', nameLc).order('id', { ascending: true }).range(from, to), { hardCap: 3000 });
    const bySource = new Map<InvSource, { observedAt: string; items: StoredItem[] }>();
    for (const r of data) {
      const source = r.source === 'quarmy' ? 'quarmy' : 'inventory';
      if (!bySource.has(source)) bySource.set(source, { observedAt: String(r.observed_at), items: [] });
      bySource.get(source)!.items.push({
        slot_label: String(r.slot_label), item_id: typeof r.item_id === 'number' ? r.item_id : null,
        item_name: String(r.item_name), quantity: Number(r.quantity) || 1,
      });
    }
    return [...bySource].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  } catch {
    return [];
  }
}

/** Which of the player's characters (name_lc) have a stored set, and from which source. */
export async function sourcesByCharacter(db: Db, playerId: string): Promise<Map<string, InvSource[]>> {
  const out = new Map<string, InvSource[]>();
  try {
    // One row per (character, source) from the hub_inventory_sources view, not one per slot: at most 100 rows.
    const { data, error } = await db.from('hub_inventory_sources').select('name_lc, source').eq('player_id', playerId).limit(200);
    if (error) return out;
    for (const r of (data ?? []) as { name_lc: string; source: string }[]) {
      const s: InvSource = r.source === 'quarmy' ? 'quarmy' : 'inventory';
      const cur = out.get(r.name_lc) ?? [];
      if (!cur.includes(s)) cur.push(s);
      out.set(r.name_lc, cur);
    }
  } catch { /* none yet */ }
  return out;
}
