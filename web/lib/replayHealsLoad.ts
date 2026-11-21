// The replay window's two extras, read in the same request that serves its frames (routes: /api/spectator/replay and
// /api/raid/session/replay): heal casts (raid_casts) and main-assist declarations (chat_messages, raid channel).
// Members-only routes call this with the service client; nothing here is for a public share.
//
//   casts  one windowed select: `cast_at >= from` and `< to`, heals only (`heal_amount > 0`, the bot's own heal
//          classification), four columns, paged. A cast that starts in one window and ends in the next is in the
//          first window's list; the board keeps every loaded window's casts, so the seam does not cut it.
//   ma     raid-channel lines that look like a declaration, from DECL_TTL_MS before the window (a declaration holds for
//          the night, so the one that governs minute 1 of a window was said before it) to its end, parsed with the bot's
//          own rules (lib/mainAssist.ts). Only the parsed NAME and time leave: never the chat text.
import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from './selectAll';
import { healWire } from './replayHeals';
import { DECL_TTL_MS, MA_LINE, parseMaDeclaration } from './mainAssist';

export type ReplayExtras = { casts: [number, string, string, number][]; ma: [number, string][] };

export async function loadHealCasts(db: SupabaseClient, guild: string, fromIso: string, toIso: string) {
  const rows = await selectAll<{ id: number; cast_at: string; caster: string; target: string; cast_secs: number | null; heal_amount: number | null }>(
    (a, b) => db.from('raid_casts')
      .select('id, cast_at, caster, target, cast_secs, heal_amount')
      .eq('guild_id', guild)
      .gte('cast_at', fromIso)
      .lt('cast_at', toIso)
      .gt('heal_amount', 0)
      .order('cast_at')
      .order('id')
      .range(a, b));
  return healWire(rows);
}

/** `known`: lower-case names of the raiders in the window (the bot asks "is this a player we know"). */
export async function loadMaDeclarations(db: SupabaseClient, guild: string, fromMs: number, toIso: string, known: ReadonlySet<string>) {
  const rows = await selectAll<{ id: number; ts: string; speaker: string; text: string }>(
    (a, b) => db.from('chat_messages')
      .select('id, ts, speaker, text')
      .eq('guild_id', guild)
      .eq('channel', 'raid')
      .gte('ts', new Date(fromMs - DECL_TTL_MS).toISOString())
      .lt('ts', toIso)
      .filter('text', 'imatch', '\\y(ma|main\\s*assist|assist)\\y')   // the bot's prefilter, at the database
      .order('ts')
      .order('id')
      .range(a, b),
    { hardCap: 5000 });
  const out: [number, string][] = [];
  for (const r of rows) {
    if (!MA_LINE.test(r.text)) continue;
    const name = parseMaDeclaration(r.text, r.speaker, n => known.has(n));
    const t = Date.parse(r.ts);
    if (name && Number.isFinite(t)) out.push([t, name]);
  }
  return out;
}

/** Both, never throwing: the frames matter more than the extras, so a failed read is "none", not a failed window. */
export async function loadReplayExtras(
  db: SupabaseClient, guild: string, fromMs: number, toMs: number, known: ReadonlySet<string>,
): Promise<ReplayExtras> {
  const fromIso = new Date(fromMs).toISOString(), toIso = new Date(toMs).toISOString();
  const [casts, ma] = await Promise.all([
    loadHealCasts(db, guild, fromIso, toIso).catch(() => []),
    loadMaDeclarations(db, guild, fromMs, toIso, known).catch(() => []),
  ]);
  // Only what the board can place: both ends of a cast (and the assist) must be raiders of this window, which also
  // keeps a narrowed raid (the session review's group) from carrying names of another raid.
  return {
    casts: casts.filter(c => known.has(c[1].toLowerCase()) && known.has(c[2].toLowerCase())),
    ma: ma.filter(m => known.has(m[1].toLowerCase())),
  };
}
