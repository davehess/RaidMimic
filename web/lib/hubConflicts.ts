// The contested names on raidmimic.com, for the officer page /admin/hub-conflicts. Pure: the page reads the rows with the
// service role and hands them here. A name is a conflict when two or more players hold it in hub_characters.

export type HolderRow = { player_id: string; name: string; name_lc: string; proof: string; first_seen_at: string; last_seen_at: string };
export type PlayerRow = { player_id: string; discord_id: string | null; display_name: string | null };
export type FlagRef = { player_id: string; name_lc: string; flag_key: string };

export type ConflictHolder = {
  playerId: string; discordId: string | null; displayName: string | null;
  proof: string; firstSeen: string; lastSeen: string; flagCount: number;
};
export type Conflict = { name: string; nameLc: string; holders: ConflictHolder[] };

/** Names held by 2+ players, each with its holders (earliest import first) and each holder's distinct flag count.
 *  Most holders first, then name. A holder's flags are counted only from that holder's own player id. */
export function groupConflicts(chars: HolderRow[], players: PlayerRow[], flags: FlagRef[]): Conflict[] {
  const byPlayer = new Map(players.map(p => [p.player_id, p]));
  const flagSets = new Map<string, Set<string>>();
  for (const f of flags) {
    const k = `${f.player_id}|${f.name_lc}`;
    if (!flagSets.has(k)) flagSets.set(k, new Set());
    flagSets.get(k)!.add(f.flag_key);
  }
  const byName = new Map<string, HolderRow[]>();
  for (const c of chars) {
    if (!byName.has(c.name_lc)) byName.set(c.name_lc, []);
    byName.get(c.name_lc)!.push(c);
  }
  const out: Conflict[] = [];
  for (const [nameLc, rows] of byName) {
    if (new Set(rows.map(r => r.player_id)).size < 2) continue;
    const holders = [...rows].sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at)).map(r => {
      const p = byPlayer.get(r.player_id);
      return {
        playerId: r.player_id, discordId: p?.discord_id ?? null, displayName: p?.display_name ?? null,
        proof: r.proof, firstSeen: r.first_seen_at, lastSeen: r.last_seen_at,
        flagCount: flagSets.get(`${r.player_id}|${nameLc}`)?.size ?? 0,
      };
    });
    out.push({ name: rows[0].name, nameLc, holders });
  }
  return out.sort((a, b) => b.holders.length - a.holders.length || a.name.localeCompare(b.name));
}
