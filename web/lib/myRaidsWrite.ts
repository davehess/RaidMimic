// The writes behind "My raids" (web/app/raids/actions.ts is the thin wrapper that reads the session). Each takes the database
// client and the SIGNED-IN player's id as arguments, and every statement is scoped by that player id: an entry or a character
// that is not the player's is never updated, linked or deleted, whatever id the browser sent. Kept out of the 'use server' file
// so a test can run them against a stub client.
import { validateEntry, MAX_GUILD_ENTRIES, type EntryInput } from './myRaids';
import { flagTargetByKey } from './flagTargets';

// The supabase client, loosely typed: the tests pass a stub with the same chain.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any };
export type WriteResult = { ok: true } | { ok: false; error: string };

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME_RX = /^[A-Za-z]{3,24}$/;
const FAIL: WriteResult = { ok: false, error: 'Could not save that just now. Try again in a minute.' };
const NOT_YOURS: WriteResult = { ok: false, error: 'That guild is not in your list.' };
const DUPLICATE: WriteResult = { ok: false, error: 'You already have that guild in your list.' };

/** True when `id` is one of this player's entries. */
async function owns(db: Db, playerId: string, id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !UUID_RX.test(id)) return false;
  const { data, error } = await db.from('hub_player_guilds').select('id').eq('id', id).eq('player_id', playerId).maybeSingle();
  return !error && !!data;
}

/** Add an entry (no `entryId`) or change one the player owns. */
export async function saveEntry(db: Db, playerId: string, entryId: string | null, input: EntryInput): Promise<WriteResult> {
  const v = validateEntry(input);
  if (!v.ok) return v;
  const e = v.value;
  if (e.guildId) {
    const { data, error } = await db.from('hub_guilds').select('guild_id').eq('guild_id', e.guildId).is('suspended_at', null).maybeSingle();
    if (error) return FAIL;
    if (!data) return { ok: false, error: 'That guild is not on Raid Mimic. Pick another, or type its name.' };
  }
  const row = {
    guild_id: e.guildId, guild_label: e.label, days: e.days, start_hhmm: e.start, duration_min: e.durationMin, tz: e.tz,
    use_guild_schedule: e.useGuildSchedule, updated_at: new Date().toISOString(),
  };
  if (entryId) {
    if (!(await owns(db, playerId, entryId))) return NOT_YOURS;
    const { error } = await db.from('hub_player_guilds').update(row).eq('id', entryId).eq('player_id', playerId);
    return error ? (error.code === '23505' ? DUPLICATE : FAIL) : { ok: true };
  }
  const { count, error: countError } = await db.from('hub_player_guilds').select('id', { count: 'exact', head: true }).eq('player_id', playerId);
  if (countError) return FAIL;
  if ((count ?? 0) >= MAX_GUILD_ENTRIES) return { ok: false, error: `You can keep up to ${MAX_GUILD_ENTRIES} guilds. Remove one first.` };
  const { error } = await db.from('hub_player_guilds').insert({ ...row, player_id: playerId });
  return error ? (error.code === '23505' ? DUPLICATE : FAIL) : { ok: true };
}

export async function removeEntry(db: Db, playerId: string, entryId: unknown): Promise<WriteResult> {
  if (!(await owns(db, playerId, entryId))) return NOT_YOURS;
  const { error } = await db.from('hub_player_guilds').delete().eq('id', entryId).eq('player_id', playerId);
  return error ? FAIL : { ok: true };
}

/** Set (or, with an empty `targetKey`, clear) the player's own target for one raid date of one of their entries. */
export async function setTarget(db: Db, playerId: string, entryId: unknown, raidDate: unknown, targetKey: unknown): Promise<WriteResult> {
  if (!(await owns(db, playerId, entryId))) return NOT_YOURS;
  const m = typeof raidDate === 'string' ? DATE_RX.exec(raidDate) : null;
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !d || d.toISOString().slice(0, 10) !== raidDate) return { ok: false, error: 'That is not a date.' };
  if (targetKey === '' || targetKey === null || targetKey === undefined) {
    const { error } = await db.from('hub_player_targets').delete().eq('player_guild_id', entryId).eq('player_id', playerId).eq('raid_date', raidDate);
    return error ? FAIL : { ok: true };
  }
  if (typeof targetKey !== 'string' || !flagTargetByKey(targetKey)) return { ok: false, error: 'Pick a target from the list.' };
  const { error } = await db.from('hub_player_targets').upsert(
    { player_guild_id: entryId, player_id: playerId, raid_date: raidDate, target_key: targetKey }, { onConflict: 'player_guild_id,raid_date' });
  return error ? FAIL : { ok: true };
}

/** Tie one of the player's characters to one of their entries (an empty `entryId` unties it). */
export async function linkCharacter(db: Db, playerId: string, name: unknown, entryId: unknown): Promise<WriteResult> {
  if (typeof name !== 'string' || !NAME_RX.test(name.trim())) return { ok: false, error: 'Not a character name.' };
  const unlink = entryId === '' || entryId === null || entryId === undefined;
  if (!unlink && !(await owns(db, playerId, entryId))) return NOT_YOURS;
  const { data, error } = await db.from('hub_characters').update({ player_guild_id: unlink ? null : entryId })
    .eq('player_id', playerId).eq('name_lc', name.trim().toLowerCase()).select('name_lc');
  if (error) return FAIL;
  return data && data.length ? { ok: true } : { ok: false, error: 'That character is not in your list.' };
}

/** Tie several characters at once (one Save for the whole list). Stops at the first refusal; at most 200 rows. */
export async function linkCharacters(db: Db, playerId: string, rows: unknown): Promise<WriteResult> {
  if (!Array.isArray(rows) || rows.length > 200) return { ok: false, error: 'Nothing to save.' };
  for (const r of rows) {
    const res = await linkCharacter(db, playerId, (r as { name?: unknown })?.name, (r as { id?: unknown })?.id);
    if (!res.ok) return res;
  }
  return { ok: true };
}
