// /admin/platform: the pure parts (the guild lead, 2026-11-18, Desk card platform-admin, option A "only me").
// Who counts as the site owner, the stuck rule, the funnel math, and how the web signs its call to the bot.

import { createHmac } from 'node:crypto';
import { discordIdOf } from './lockout';

const DAY_MS = 24 * 3600 * 1000;

/** SITE_OWNER_DISCORD_IDS: comma list of Discord ids. Unset or malformed entries = nobody (fails closed). */
export function siteOwnerIds(raw: string | undefined | null = process.env.SITE_OWNER_DISCORD_IDS): string[] {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(s => /^\d{5,25}$/.test(s));
}

export function isSiteOwner(
  user: { app_metadata?: unknown; user_metadata?: unknown; identities?: unknown } | null | undefined,
  raw: string | undefined | null = process.env.SITE_OWNER_DISCORD_IDS,
): boolean {
  const owners = siteOwnerIds(raw);
  if (!owners.length) return false;
  const id = discordIdOf(user);
  return id != null && owners.includes(id);
}

export type GuildRow = { guild_id: string; display_name: string; created_at: string; plan: string | null; discord_guild_id: string | null };

/** Created over 24 h ago, no invite ever made, one active member or fewer. */
export function isStuck(created_at: string, invites: number, members: number, now = Date.now()): boolean {
  const age = now - Date.parse(created_at);
  return age > DAY_MS && invites === 0 && members <= 1;
}

export type FunnelInput = {
  players: Set<string>;                 // non-deleted player ids
  memberships: { guild_id: string; player_id: string; role: string | null; left_at: string | null }[];
  invites: { guild_id: string }[];
  guilds: { guild_id: string }[];
};

export function funnel({ players, memberships, invites, guilds }: FunnelInput) {
  const made = new Set(memberships.filter(m => m.role === 'owner' && players.has(m.player_id)).map(m => m.player_id));
  const invited = new Set(invites.map(i => i.guild_id));
  const active = new Map<string, number>();
  for (const m of memberships) if (!m.left_at) active.set(m.guild_id, (active.get(m.guild_id) ?? 0) + 1);
  return {
    players: players.size,
    madeGuild: made.size,
    guilds: guilds.length,
    withInvite: guilds.filter(g => invited.has(g.guild_id)).length,
    multiMember: guilds.filter(g => (active.get(g.guild_id) ?? 0) > 1).length,
    active,
    invited,
  };
}

/** Header the bot's GET /api/platform/stats checks (utils/platformStatsAuth.js): HMAC of PLATFORM_STATS_SECRET, per minute. */
export function platformSig(key: string, now = Date.now()): string {
  return createHmac('sha256', key).update(`platform-stats:${Math.floor(now / 60000)}`).digest('hex');
}

export type BotStats = {
  routes: { window_hours: number; since: string; total_bytes: number; total_requests: number; routes: { route: string; requests: number; bytes: number }[] };
  bot: { version: string; uptime_sec: number; mem: Record<string, number> | null; breaker: { open: boolean; probing: boolean; consecutiveFailures: number; cooldownRemainingMs: number } | null };
};

export async function fetchBotStats(base: string, key: string | undefined): Promise<BotStats | null> {
  if (!key || !/^https:\/\//.test(base)) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(`${base.replace(/\/+$/, '')}/api/platform/stats`, {
      headers: { 'x-platform-sig': platformSig(key) }, cache: 'no-store', signal: ctl.signal,
    });
    return r.ok ? ((await r.json()) as BotStats) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}

export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
