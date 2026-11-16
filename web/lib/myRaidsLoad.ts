// The read behind "My raids" (web/app/raids): a signed-in player's own guild entries, their characters' links, the targets
// they set, the schedules and published targets of the registered guilds they chose. Keyed on the Discord id taken from the
// session, never from a request; everything is scoped to that player's id. The hub_* tables may not exist on a database the
// registry has not been applied to: every read fails soft to "nothing yet".
import { supabaseAdmin } from '@/lib/supabase';
import { loadMine } from '@/lib/hubMine';
import { mergeSettings } from '@/lib/guildSettings';
import { MAX_GUILD_ENTRIES, type GuildEntry, type MyCharacter, type PublishedTarget } from '@/lib/myRaids';

export type RegisteredGuild = { guildId: string; name: string };
export type MyRaidsData = {
  playerId: string | null;
  entries: GuildEntry[];
  characters: MyCharacter[];
  registered: RegisteredGuild[];
  guildSchedules: Record<string, unknown>;
  targetsByEntryDate: Record<string, string>;
  published: PublishedTarget[];
  /** Guilds with a saved schedule, by guild id, so the form can say "uses the guild's schedule". */
  guildHasSchedule: Record<string, boolean>;
};

const EMPTY: MyRaidsData = { playerId: null, entries: [], characters: [], registered: [], guildSchedules: {}, targetsByEntryDate: {}, published: [], guildHasSchedule: {} };

export async function loadMyRaids(discordId: string): Promise<MyRaidsData> {
  try {
    const admin = supabaseAdmin();
    const { data: player } = await admin.from('hub_players').select('player_id').eq('discord_id', discordId).is('deleted_at', null).maybeSingle();
    const { data: guilds } = await admin.from('hub_guilds').select('guild_id, display_name').is('suspended_at', null).order('display_name').limit(500);
    const registered: RegisteredGuild[] = (guilds ?? []).map(g => ({ guildId: String(g.guild_id), name: String(g.display_name) }));
    if (!player) return { ...EMPTY, registered };
    const playerId = player.player_id as string;
    const nameOf = new Map(registered.map(g => [g.guildId, g.name]));

    const { data: rows } = await admin.from('hub_player_guilds')
      .select('id, guild_id, guild_label, days, start_hhmm, duration_min, tz, use_guild_schedule').eq('player_id', playerId)
      .order('created_at').limit(MAX_GUILD_ENTRIES);
    const entries: GuildEntry[] = (rows ?? []).map(r => ({
      id: String(r.id),
      guildId: (r.guild_id as string | null) ?? null,
      guildName: (r.guild_id ? nameOf.get(String(r.guild_id)) : null) ?? String(r.guild_label ?? r.guild_id ?? 'Guild'),
      days: ((r.days as number[] | null) ?? []).map(Number),
      startHhmm: (r.start_hhmm as string | null) ?? null,
      durationMin: (r.duration_min as number | null) ?? null,
      tz: String(r.tz),
      useGuildSchedule: r.use_guild_schedule !== false,
    }));

    const mine = await loadMine(discordId);
    const { data: links } = await admin.from('hub_characters').select('name_lc, player_guild_id').eq('player_id', playerId).limit(200);
    const linkOf = new Map((links ?? []).map(l => [String(l.name_lc), (l.player_guild_id as string | null) ?? null]));
    const characters: MyCharacter[] = mine.map(c => ({ name: c.name, flags: c.keys, playerGuildId: linkOf.get(c.name.toLowerCase()) ?? null }));

    const guildIds = Array.from(new Set(entries.map(e => e.guildId).filter((x): x is string => !!x)));
    const guildSchedules: Record<string, unknown> = {};
    const guildHasSchedule: Record<string, boolean> = {};
    let published: PublishedTarget[] = [];
    if (guildIds.length) {
      const { data: settings } = await admin.from('guild_settings').select('guild_id, settings').in('guild_id', guildIds);
      for (const s of settings ?? []) {
        guildSchedules[String(s.guild_id)] = s.settings;
        guildHasSchedule[String(s.guild_id)] = mergeSettings(s.settings).schedule.days.length > 0;
      }
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const { data: ev } = await admin.from('flag_events').select('guild_id, target_key, starts_at').in('guild_id', guildIds).gte('starts_at', since).order('starts_at').limit(200);
      published = (ev ?? []).map(e => ({ guildId: String(e.guild_id), startsMs: Date.parse(String(e.starts_at)), targetKey: String(e.target_key) })).filter(p => Number.isFinite(p.startsMs));
    }

    const { data: tgt } = await admin.from('hub_player_targets').select('player_guild_id, raid_date, target_key').eq('player_id', playerId)
      .gte('raid_date', new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)).limit(500);
    const targetsByEntryDate: Record<string, string> = {};
    for (const t of tgt ?? []) targetsByEntryDate[`${t.player_guild_id}|${t.raid_date}`] = String(t.target_key);

    return { playerId, entries, characters, registered, guildSchedules, targetsByEntryDate, published, guildHasSchedule };
  } catch {
    return EMPTY;
  }
}
