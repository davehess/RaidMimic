// The durable half of the "My characters" import limit (hub_import_attempts, supabase/migrations/20261115120000): one row
// per import, counted per player over the last hour, so the cap holds across serverless instances. The in-memory limiter
// in app/characters/actions.ts stays as the first layer. Unlike the invite-guess limiter this FAILS OPEN: an import is
// not a guess, a count that cannot be read must not lock a signed-in player out, and the in-memory layer still applies.
// Pure except through the two functions passed in, so it is tested without a database.

export const MAX_IMPORTS_PER_HOUR = 20;
export const IMPORT_WINDOW_MS = 60 * 60_000;

let warned = false;

/** True when this player may import now. Counts first, then records the attempt (best effort). */
export async function importAllowed(
  count: (sinceIso: string) => Promise<{ count: number | null; error: unknown }>,
  record: () => Promise<unknown>,
  nowMs: number = Date.now(),
): Promise<boolean> {
  let n = 0;
  try {
    const r = await count(new Date(nowMs - IMPORT_WINDOW_MS).toISOString());
    if (r.error) throw r.error;
    n = r.count ?? 0;
  } catch {
    if (!warned) { warned = true; console.log('[hub] import limiter: attempt count unreadable, letting imports through'); }
    return true;
  }
  if (n >= MAX_IMPORTS_PER_HOUR) return false;
  try { await record(); } catch { /* counted next time */ }
  return true;
}
