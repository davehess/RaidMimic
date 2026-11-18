'use server';

// The forms on /raids (My raids, raidmimic.com). The player is the SIGNED-IN one, taken from the session and looked up as the
// hub_players row; nothing the browser sends names a player. The rules and the player-scoped writes are
// web/lib/myRaidsWrite.ts. A form posts here and the page reloads: a refusal comes back as a plain-text line in `?err=`.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { discordIdOf } from '@/lib/lockout';
import { makeLimiter } from '@/lib/popRecitalSave';
import { profileOf } from '@/lib/hubRegistry';
import { saveEntry, removeEntry, setTarget, linkCharacters, type WriteResult } from '@/lib/myRaidsWrite';

const allowed = makeLimiter(40, 10 * 60_000);

const str = (f: FormData, k: string) => String(f.get(k) ?? '');

function done(r: WriteResult): never {
  revalidatePath('/raids');
  redirect(r.ok ? '/raids' : `/raids?err=${encodeURIComponent(r.error.slice(0, 160))}`);
}

/** The signed-in player's id (the row is created on first use, like /characters), or a refusal line. */
async function player(): Promise<{ error: string } | { playerId: string }> {
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);
  if (!user || !discordId) return { error: 'Sign in first.' };
  if (!allowed(discordId)) return { error: 'Too many changes. Wait a few minutes and try again.' };
  const { displayName, avatarUrl } = profileOf(user);
  const { data, error } = await supabaseAdmin().from('hub_players')
    .upsert({ discord_id: discordId, display_name: displayName, avatar_url: avatarUrl, last_seen_at: new Date().toISOString() }, { onConflict: 'discord_id' })
    .select('player_id, deleted_at').single();
  if (error || !data) return { error: 'Raid Mimic accounts are not open yet.' };
  if (data.deleted_at) return { error: 'This account was deleted.' };
  return { playerId: data.player_id as string };
}

async function run(f: (playerId: string) => Promise<WriteResult>): Promise<never> {
  const p = await player();
  if ('error' in p) return done({ ok: false, error: p.error });
  return done(await f(p.playerId));
}

/** Add a guild (no `id`) or change one. `guild` is a registered guild's id, or "other" with the name in `label`. */
export async function saveGuild(formData: FormData): Promise<void> {
  const guild = str(formData, 'guild');
  const id = str(formData, 'id');
  await run(pid => saveEntry(supabaseAdmin(), pid, id || null, {
    guildId: guild && guild !== 'other' ? guild : null,
    label: formData.get('label'),
    days: formData.getAll('days').map(String),
    start: formData.get('start'),
    durationMin: formData.get('duration'),
    tz: formData.get('tz'),
    useGuildSchedule: formData.get('useGuild') === 'on',
  }));
}

export async function removeGuild(formData: FormData): Promise<void> {
  await run(pid => removeEntry(supabaseAdmin(), pid, str(formData, 'id')));
}

/** Save the night's picks in place (keys joined into one list; none clears it). Returns the result, so the page does not reload. */
export async function saveRaidTargets(entryId: string, date: string, keys: string[]): Promise<WriteResult> {
  const p = await player();
  if ('error' in p) return { ok: false, error: p.error };
  const list = Array.isArray(keys) ? keys.map(String).join(',') : '';
  const r = await setTarget(supabaseAdmin(), p.playerId, entryId, date, list);
  if (r.ok) revalidatePath('/raids');
  return r;
}

/** Save the characters' guilds in place: returns the result instead of redirecting, so the page does not reload. */
export async function setCharacterGuilds(rows: { name: string; id: string }[]): Promise<WriteResult> {
  const p = await player();
  if ('error' in p) return { ok: false, error: p.error };
  const r = await linkCharacters(supabaseAdmin(), p.playerId, rows);
  if (r.ok) revalidatePath('/raids');
  return r;
}
