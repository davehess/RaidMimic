// Officer tool: character names that more than one Raid Mimic player has loaded. A player's flags are stored under that
// player only (web/lib/hubImport.ts), so a shared name never mixes anyone's flags; this page is where an officer sees who
// holds what and settles it. Officers only (requireOfficer), read with the service role, server-side. The names and Discord
// ids shown here are never sent to the players' own pages. Everything is rendered as plain text.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { requireOfficer } from '@/lib/officer';
import { selectAll } from '@/lib/selectAll';
import { groupConflicts, type HolderRow, type PlayerRow, type FlagRef } from '@/lib/hubConflicts';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Contested names',
  description: 'Character names two or more Raid Mimic players have loaded, with who holds each and how many flags each has.',
};

const CAP = 250;

export default async function HubConflictsPage() {
  await requireOfficer();
  const sb = supabaseAdmin();
  // Names with at least one contested row, then every holder of those names (a holder can read 'claimed' only briefly).
  const { data: seeds } = await sb.from('hub_characters').select('name_lc').eq('proof', 'contested').limit(1000);
  const lcs = [...new Set((seeds ?? []).map(r => String(r.name_lc)))].slice(0, CAP);
  let chars: HolderRow[] = [];
  let players: PlayerRow[] = [];
  let flags: FlagRef[] = [];
  if (lcs.length) {
    const { data } = await sb.from('hub_characters').select('player_id, name, name_lc, proof, first_seen_at, last_seen_at').in('name_lc', lcs).limit(1000);
    chars = (data ?? []) as HolderRow[];
    const ids = [...new Set(chars.map(c => c.player_id))];
    const { data: pl } = ids.length
      ? await sb.from('hub_players').select('player_id, discord_id, display_name').in('player_id', ids)
      : { data: [] as PlayerRow[] };
    players = (pl ?? []) as PlayerRow[];
    flags = await selectAll<FlagRef>((from, to) => sb.from('hub_flags').select('player_id, name_lc, flag_key')
      .in('name_lc', lcs).in('player_id', ids).order('id', { ascending: true }).range(from, to), { hardCap: 50000 });
  }
  const conflicts = groupConflicts(chars, players, flags);

  return (
    <div className="space-y-6">
      <div className="text-sm"><Link href="/admin" className="text-blue hover:underline">← back to admin</Link></div>
      <section className="bg-panel border border-border rounded-lg p-4">
        <h2 className="text-xl text-gold mb-1">Contested names</h2>
        <p className="text-sm text-dim leading-6">
          Names that two or more players loaded on raidmimic.com. Each player&apos;s flags are kept under their own Discord login
          only, so nobody&apos;s flags are mixed or overwritten; both stay hidden from feeds until an officer settles it.
          Earliest import first. Plain text from members, never acted on automatically.
        </p>
      </section>
      {conflicts.length === 0 ? (
        <section className="bg-panel border border-border rounded-lg p-4 text-sm text-dim">No contested names.</section>
      ) : (
        <div className="space-y-3">
          {conflicts.map(c => (
            <section key={c.nameLc} className="bg-panel border border-border rounded-lg p-3">
              <h3 className="text-text"><b>{c.name}</b> <span className="text-xs text-dim">held by {c.holders.length} players</span></h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs min-w-max">
                  <thead className="text-dim"><tr>
                    {['Display name', 'Discord id', 'Player id', 'Proof', 'First import', 'Last import', 'Flags'].map(h => <th key={h} scope="col" className="px-2 py-1 font-normal">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {c.holders.map(h => (
                      <tr key={h.playerId} className="border-t border-border">
                        <td className="px-2 py-1 text-text">{h.displayName ?? '—'}</td>
                        <td className="px-2 py-1 text-dim">{h.discordId ?? '—'}</td>
                        <td className="px-2 py-1 text-dim">{h.playerId}</td>
                        <td className="px-2 py-1 text-dim">{h.proof}</td>
                        <td className="px-2 py-1 text-dim whitespace-nowrap">{h.firstSeen.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-2 py-1 text-dim whitespace-nowrap">{h.lastSeen.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-2 py-1 text-text">{h.flagCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
