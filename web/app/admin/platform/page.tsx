// /admin/platform — the site owner's view of the platform (the guild lead, 2026-11-18, Desk card platform-admin,
// option A "only me"). Three blocks: the Raid Mimic funnel, data out by route (from the bot, in memory, 24 h), and the
// bot's own health. Owner-only: the /admin layout lets officers in, this page then requires SITE_OWNER_DISCORD_IDS
// (fails closed; unset = nobody). No member names and no Discord ids are printed.
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireOfficer } from '@/lib/officer';
import { selectAll } from '@/lib/selectAll';
import { WOLFPACK_BOT_URL } from '@/lib/hubDirectory';
import { isSiteOwner, isStuck, funnel, fetchBotStats, fmtBytes, fmtUptime, type GuildRow } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: '[beta] Platform · Admin',
  description: 'Site-owner view of the Raid Mimic funnel, data out by route and bot health.',
};

type Mem = { guild_id: string; player_id: string; role: string | null; left_at: string | null };

export default async function PlatformPage() {
  await requireOfficer();
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!isSiteOwner(user)) notFound();

  const admin = supabaseAdmin();
  const [guilds, memberships, invites, players, chars, bot] = await Promise.all([
    selectAll<GuildRow>((from, to) => admin.from('hub_guilds')
      .select('guild_id, display_name, plan, created_at, discord_guild_id')
      .order('created_at', { ascending: false }).order('guild_id').range(from, to)),
    selectAll<Mem>((from, to) => admin.from('hub_memberships')
      .select('guild_id, player_id, role, left_at').order('guild_id').order('player_id').range(from, to)),
    selectAll<{ guild_id: string; code: string }>((from, to) => admin.from('hub_invites')
      .select('guild_id, code').order('code').range(from, to)),
    selectAll<{ player_id: string }>((from, to) => admin.from('hub_players')
      .select('player_id').is('deleted_at', null).order('player_id').range(from, to)),
    admin.from('hub_characters').select('player_id', { count: 'exact', head: true }),
    fetchBotStats(process.env.HUB_BOT_URL || WOLFPACK_BOT_URL, process.env.PLATFORM_STATS_SECRET),
  ]);

  const f = funnel({ players: new Set(players.map(p => p.player_id)), memberships, invites, guilds });
  const invCount = new Map<string, number>();
  for (const i of invites) invCount.set(i.guild_id, (invCount.get(i.guild_id) ?? 0) + 1);
  const now = Date.now();
  const tiles = [
    ['Players', f.players], ['Made a guild', f.madeGuild], ['Guilds', f.guilds],
    ['Guilds with an invite', f.withInvite], ['Guilds with 2+ members', f.multiMember], ['Characters', chars.count ?? 0],
  ] as const;
  const r = bot?.routes;
  const total = r?.total_bytes || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-gold">Platform <span className="text-xs text-dim">[beta]</span></h1>
        <p className="text-sm text-dim mt-1">Site owner only. Counts, no names.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm text-blue">Raid Mimic funnel</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {tiles.map(([label, value]) => (
            <div key={label} className="bg-panel border border-border rounded-lg p-3">
              <div className="text-xl text-text font-semibold tabular-nums">{value}</div>
              <div className="text-xs text-dim mt-1">{label}</div>
            </div>
          ))}
        </div>
        <div className="bg-panel border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-dim text-left">
              <tr><th className="p-2">Guild</th><th className="p-2">Created</th><th className="p-2">Plan</th>
                <th className="p-2 text-right">Members</th><th className="p-2 text-right">Invites</th><th className="p-2">Discord</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {guilds.map(g => {
                const members = f.active.get(g.guild_id) ?? 0;
                const inv = invCount.get(g.guild_id) ?? 0;
                return (
                  <tr key={g.guild_id} className="border-t border-border">
                    <td className="p-2 text-text">{g.display_name}</td>
                    <td className="p-2 text-dim">{new Date(g.created_at).toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td className="p-2 text-dim">{g.plan ?? '—'}</td>
                    <td className="p-2 text-right">{members}</td>
                    <td className="p-2 text-right">{inv}</td>
                    <td className="p-2">{g.discord_guild_id ? 'yes' : 'no'}</td>
                    <td className="p-2 text-orange">{isStuck(g.created_at, inv, members, now) ? 'stuck' : ''}</td>
                  </tr>
                );
              })}
              {!guilds.length && <tr><td className="p-3 text-dim" colSpan={7}>No guilds yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-blue">Data out by route <span className="text-dim text-xs">
          {r ? `· last 24 h, counting since ${r.since.slice(0, 16).replace('T', ' ')} UTC · ${fmtBytes(total)} · ${r.total_requests} requests` : ''}</span></h2>
        {!r ? <p className="text-sm text-dim">The bot did not answer.</p> : (
          <div className="bg-panel border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-dim text-left">
                <tr><th className="p-2">Route</th><th className="p-2 text-right">Bytes</th><th className="p-2 text-right">Share</th>
                  <th className="p-2 text-right">Requests</th><th className="p-2 text-right">Average</th></tr>
              </thead>
              <tbody>
                {r.routes.slice(0, 25).map(x => (
                  <tr key={x.route} className="border-t border-border">
                    <td className="p-2 text-text break-all">{x.route}</td>
                    <td className="p-2 text-right">{fmtBytes(x.bytes)}</td>
                    <td className="p-2 text-right">{total ? ((x.bytes / total) * 100).toFixed(1) : '0.0'}%</td>
                    <td className="p-2 text-right">{x.requests}</td>
                    <td className="p-2 text-right">{fmtBytes(x.requests ? x.bytes / x.requests : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-blue">Bot</h2>
        {!bot ? <p className="text-sm text-dim">The bot did not answer.</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-panel border border-border rounded-lg p-3"><div className="text-dim text-xs">Version</div>{bot.bot.version}</div>
            <div className="bg-panel border border-border rounded-lg p-3"><div className="text-dim text-xs">Uptime</div>{fmtUptime(bot.bot.uptime_sec)}</div>
            <div className="bg-panel border border-border rounded-lg p-3 tabular-nums"><div className="text-dim text-xs">Memory</div>
              {bot.bot.mem ? `${bot.bot.mem.rss_mb} MB rss · ${bot.bot.mem.heap_used_mb}/${bot.bot.mem.heap_limit_mb} MB heap` : '—'}</div>
            <div className="bg-panel border border-border rounded-lg p-3"><div className="text-dim text-xs">Database breaker</div>
              {bot.bot.breaker ? (bot.bot.breaker.open ? <span className="text-red">open</span> : <span className="text-green">closed</span>) : '—'}
              {bot.bot.breaker ? ` · ${bot.bot.breaker.consecutiveFailures} failures` : ''}</div>
          </div>
        )}
      </section>
    </div>
  );
}
