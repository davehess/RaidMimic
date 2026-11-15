'use server';

// Load characters from Zeal's `<Name>-PoPFlags.txt` exports (DECISIONS §545), or from pasted #popflags / Seer lines. The
// rules are web/lib/hubImport.ts; this wires them to the session and the hub_* tables with the service role, server-side
// only. The player is the SIGNED-IN one, taken from the session, never from an argument. Writes go to hub_characters and
// hub_flags and nothing else; the only Wolf Pack table touched is one READ of `characters`, for the claim rule.
// Both import actions go through the SAME importExports (caps, claim rule, dedupe) and the same two-layer limiter:
// the in-memory one below, then hub_import_attempts (20 an hour per player, web/lib/hubImportLimit.ts).

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { discordIdOf } from '@/lib/lockout';
import { GUILD_TAG } from '@/lib/guild';
import { makeLimiter } from '@/lib/popRecitalSave';
import { profileOf } from '@/lib/hubRegistry';
import { importAllowed } from '@/lib/hubImportLimit';
import {
  importExports, pasteToFile, NAME_RX, MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD,
  type ImportDeps, type ImportResult, type UploadFile,
} from '@/lib/hubImport';

const allowed = makeLimiter(10, 10 * 60_000);
const TOO_MANY = 'Too many uploads. Wait a few minutes and try again.';

type Admin = ReturnType<typeof supabaseAdmin>;

/** The signed-in player's id (created on first use), after both limiter layers. */
async function openPlayer(): Promise<{ error: string } | { admin: Admin; playerId: string; discordId: string }> {
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);
  if (!user || !discordId) return { error: 'Sign in first.' };
  if (!allowed(discordId)) return { error: TOO_MANY };

  const admin = supabaseAdmin();
  const { displayName, avatarUrl } = profileOf(user);
  const { data: player, error: playerError } = await admin.from('hub_players')
    .upsert({ discord_id: discordId, display_name: displayName, avatar_url: avatarUrl, last_seen_at: new Date().toISOString() }, { onConflict: 'discord_id' })
    .select('player_id, deleted_at')
    .single();
  if (playerError || !player) return { error: 'Raid Mimic accounts are not open yet.' };
  if (player.deleted_at) return { error: 'This account was deleted.' };
  const playerId = player.player_id as string;
  const ok = await importAllowed(
    async since => await admin.from('hub_import_attempts').select('player_id', { count: 'exact', head: true }).eq('player_id', playerId).gte('at', since),
    async () => { await admin.from('hub_import_attempts').insert({ player_id: playerId }); },
  );
  if (!ok) return { error: 'You have loaded a lot in the last hour. Wait a while and try again.' };
  return { admin, playerId, discordId };
}

function depsFor(admin: Admin, playerId: string, discordId: string): ImportDeps {
  return {
    playerId, discordId, now: Date.now,
    async heldNames() {
      const { data, error } = await admin.from('hub_characters').select('name_lc').eq('player_id', playerId).limit(200);
      return error ? null : (data ?? []).map(r => r.name_lc as string);
    },
    async wolfpackOwners(lcs) {
      // Names are letters only (NAME_RX), so they are safe inside the filter.
      const { data, error } = await admin.from('characters').select('name, discord_id')
        .eq('guild_id', GUILD_TAG).or(lcs.map(lc => `name.ilike.${lc}`).join(',')).limit(500);
      if (error) return null;
      const m = new Map<string, string>();
      for (const r of data ?? []) {
        const lc = String(r.name || '').toLowerCase();
        if (lc && r.discord_id && !m.has(lc)) m.set(lc, String(r.discord_id));
      }
      return m;
    },
    async holders(lcs) {
      const { data, error } = await admin.from('hub_characters').select('player_id, name_lc, proof').in('name_lc', lcs).limit(1000);
      if (error) return null;
      const m = new Map<string, { player_id: string; proof: string }[]>();
      for (const h of data ?? []) {
        const k = h.name_lc as string;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push({ player_id: h.player_id as string, proof: h.proof as string });
      }
      return m;
    },
    async insertCharacters(rows) {
      const { error } = await admin.from('hub_characters').upsert(rows, { onConflict: 'player_id,name_lc', ignoreDuplicates: true });
      return error ? error.message : null;
    },
    async touchCharacters(pid, lcs) {
      const { error } = await admin.from('hub_characters').update({ last_seen_at: new Date().toISOString() }).eq('player_id', pid).in('name_lc', lcs);
      return error ? error.message : null;
    },
    async flipContested(lcs) {
      const { error } = await admin.from('hub_characters').update({ proof: 'contested' }).in('name_lc', lcs).eq('proof', 'claimed');
      return error ? error.message : null;
    },
    async insertFlags(rows) {
      const { error } = await admin.from('hub_flags').upsert(rows, { onConflict: 'player_id,name_lc,flag_key,earned_at', ignoreDuplicates: true });
      return error ? error.message : null;
    },
  };
}

export async function importCharacters(formData: FormData): Promise<ImportResult> {
  const entries = formData.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'text' in f);
  if (entries.length > MAX_FILES_PER_UPLOAD) return { ok: false, error: `Up to ${MAX_FILES_PER_UPLOAD} files at a time.` };
  const s = await openPlayer();
  if ('error' in s) return { ok: false, error: s.error };
  // An oversize file is measured, not read: only its size reaches the rules, which reject it.
  const files = await Promise.all(entries.map(async f => ({
    name: String(f.name || 'file'), size: f.size, text: f.size > MAX_FILE_BYTES ? '' : await f.text(),
  })));
  const result = await importExports(files, depsFor(s.admin, s.playerId, s.discordId));
  if (result.ok) revalidatePath('/characters');
  return result;
}

/** A pasted block (the #popflags lines, a Zeal file's text, or what the Seer said) for one named character. */
export async function importPaste(formData: FormData): Promise<ImportResult & { unrecognised?: number }> {
  const name = String(formData.get('name') ?? '');
  const paste = String(formData.get('paste') ?? '');
  // The caps and the read come first: an over-size or unreadable paste never costs a database call.
  const made = pasteToFile(name, paste, Date.now());
  if (!made.ok) return { ok: false, error: made.error };
  const s = await openPlayer();
  if ('error' in s) return { ok: false, error: s.error };
  const files: UploadFile[] = [made.file];
  const result = await importExports(files, depsFor(s.admin, s.playerId, s.discordId));
  if (result.ok) revalidatePath('/characters');
  return result.ok ? { ...result, unrecognised: made.unrecognised } : result;
}

/** Remove one of the signed-in player's characters and its flags. Only that player's rows, only that name. */
export async function removeCharacter(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const name = String(formData.get('name') ?? '').trim();
  if (!NAME_RX.test(name)) return { ok: false, error: 'Not a character name.' };
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);
  if (!user || !discordId) return { ok: false, error: 'Sign in first.' };
  const admin = supabaseAdmin();
  const { data: player } = await admin.from('hub_players').select('player_id').eq('discord_id', discordId).is('deleted_at', null).maybeSingle();
  if (!player) return { ok: false, error: 'Nothing to remove.' };
  const lc = name.toLowerCase();
  const flags = await admin.from('hub_flags').delete().eq('player_id', player.player_id).eq('name_lc', lc);
  const chars = await admin.from('hub_characters').delete().eq('player_id', player.player_id).eq('name_lc', lc);
  if (flags.error || chars.error) return { ok: false, error: 'Could not remove it just now. Try again in a minute.' };
  revalidatePath('/characters');
  return { ok: true };
}
