// /spectator/replay: heal arcs, the "Me" button's rule, and the wire format they ride on. The pure parts (no React,
// no three.js, no Supabase), shared by the 2D board, the 3D view, the routes and the tests.
//
// WHERE THE DATA COMES FROM
// raid_casts (utils/raidHistory.js noteCast): one row per cast START, only for casters whose own stream is uploaded.
// `heal_amount` is the spell catalog's estimate for a heal and NULL for anything else, so "is this a heal" is the
// bot's own classification, read at the database (`heal_amount > 0`), not re-derived here. A row with no cast_secs
// has no window to draw and is dropped; nothing is guessed. The route sends only heals, as `[ms, caster, target, secs]`.
//
// What an arc says, and what it does not: a caster began a heal on a target. It does not say the heal landed, and a
// raider whose stream is not uploaded draws nothing, so an absent arc is not evidence nobody healed.

export type HealCast = { t: number; caster: string; target: string; secs: number };   // t: epoch ms of the cast start

export const MAX_HEAL_SECS = 12;       // the longest cast drawn (Complete Healing is 10 s)
export const HEAL_FADE_MS = 1200;      // an arc fades out over this after the cast completes
export const MAX_ARCS = 48;            // per picture: a ring of Complete Healings is 6-10

/** The wire rows -> casts, sorted by start. Anything malformed is skipped. */
export function parseHealCasts(wire: unknown): HealCast[] {
  if (!Array.isArray(wire)) return [];
  const out: HealCast[] = [];
  for (const w of wire) {
    if (!Array.isArray(w)) continue;
    const [t, caster, target, secs] = w as [unknown, unknown, unknown, unknown];
    if (typeof t !== 'number' || typeof caster !== 'string' || typeof target !== 'string' || typeof secs !== 'number') continue;
    if (!caster || !target || !(secs > 0)) continue;
    out.push({ t, caster, target, secs: Math.min(secs, MAX_HEAL_SECS) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The rows of a `raid_casts` read -> the wire. Heals only, a usable window only, the name case kept. */
export function healWire(rows: readonly { cast_at: string; caster: string; target: string; cast_secs: number | null; heal_amount?: number | null }[]): [number, string, string, number][] {
  const out: [number, string, string, number][] = [];
  for (const r of rows) {
    const t = Date.parse(r.cast_at);
    const secs = Number(r.cast_secs);
    if (!Number.isFinite(t) || !(secs > 0) || !r.caster || !r.target) continue;
    if ('heal_amount' in r && !(Number(r.heal_amount) > 0)) continue;   // selected and NULL/0: not a heal
    out.push([t, r.caster, r.target, Math.round(secs * 100) / 100]);
  }
  return out;
}

/** Is the cast on screen at `t`? From its start until HEAL_FADE_MS after it completes. */
export const healActive = (c: Pick<HealCast, 't' | 'secs'>, t: number) => t >= c.t && t < c.t + c.secs * 1000 + HEAL_FADE_MS;

export type Arc = {
  caster: string; target: string;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  zone: string | null;
  /** Cast progress 0..1: the heal dot rides the arch from the healer (0) to the target (1) as the cast fills. */
  p: number;
  /** 1 while casting, then fading to 0. */
  alpha: number;
  /** Seconds until the heal lands; 0 once it has. */
  left: number;
  /** Ms since it landed; negative while still casting. */
  since: number;
};

export const HEAL_LAND_MS = 600;       // the pulse on the target when a heal lands
export const HEAL_LABEL_MIN_S = 0.1;   // the countdown is hidden in the last tenth of a second
export const GUIDE_ALPHA = 0.3;        // the arch itself is a faint full-length guide; the dot is what moves

/** The countdown beside the dot: seconds left, one decimal ("1.4"); null in the last tenth and after landing. */
export const healLabel = (left: number): string | null => (left >= HEAL_LABEL_MIN_S ? left.toFixed(1) : null);

/** The landing pulse's progress 0..1 over HEAL_LAND_MS, or null when nothing has just landed. */
export const landPulse = (since: number): number | null => (since >= 0 && since < HEAL_LAND_MS ? since / HEAL_LAND_MS : null);

/**
 * Which arcs carry a countdown: only the one nearest to landing per target, so a chain of Complete Healings onto one
 * tank shows one number ("next heal in 0.8"), not a pile. The dots all still travel. Returns indices into `arcs`.
 */
export function labelledArcs(arcs: readonly Pick<Arc, 'target' | 'left'>[]): Set<number> {
  const best = new Map<string, number>();
  arcs.forEach((a, i) => {
    if (healLabel(a.left) === null) return;
    const k = a.target.toLowerCase(), j = best.get(k);
    if (j === undefined || a.left < arcs[j].left) best.set(k, i);
  });
  return new Set(best.values());
}
type Where = { x: number; y: number; z: number; zone: string | null };

/**
 * The arcs on screen at `t`. `casts` is sorted by start; `find` places a raider by name (case-insensitive is the
 * caller's job) or returns null. A cast whose caster or target is not placed, or is the same raider, draws nothing,
 * and so does a pair in different zones.
 */
export function activeArcs(casts: readonly HealCast[], t: number, find: (name: string) => Where | null): Arc[] {
  // The first cast that could still be showing began no earlier than the longest window ago.
  const floor = t - MAX_HEAL_SECS * 1000 - HEAL_FADE_MS;
  let lo = 0, hi = casts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (casts[mid].t < floor) lo = mid + 1; else hi = mid; }
  const out: Arc[] = [];
  for (let i = lo; i < casts.length && casts[i].t <= t && out.length < MAX_ARCS; i++) {
    const c = casts[i];
    if (!healActive(c, t)) continue;
    const a = find(c.caster), b = find(c.target);
    if (!a || !b || a === b || a.zone !== b.zone) continue;
    const done = c.t + c.secs * 1000;
    out.push({
      caster: c.caster, target: c.target, zone: a.zone,
      from: { x: a.x, y: a.y, z: a.z }, to: { x: b.x, y: b.y, z: b.z },
      p: Math.min(1, (t - c.t) / (c.secs * 1000)),
      alpha: t < done ? 1 : Math.max(0, 1 - (t - done) / HEAL_FADE_MS),
      left: Math.max(0, (done - t) / 1000),
      since: t - done,
    });
  }
  return out;
}

/** A point on the arch from `a` to `b` at fraction `u` (0..1): a quadratic curve bowed by `bow` x the chord length, to the left. */
export function archPoint(ax: number, ay: number, bx: number, by: number, u: number, bow = 0.28): { x: number; y: number } {
  const dx = bx - ax, dy = by - ay;
  const cx = (ax + bx) / 2 - dy * bow, cy = (ay + by) / 2 + dx * bow;
  const k = 1 - u;
  return { x: k * k * ax + 2 * k * u * cx + u * u * bx, y: k * k * ay + 2 * k * u * cy + u * u * by };
}

// ── The Me button ───────────────────────────────────────────────────────────

/** The member's own characters that are in the replay, in the order the account lists them (main first). */
export function presentMine(mine: readonly string[], roster: ReadonlyMap<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of mine) {
    const k = n.toLowerCase();
    if (!seen.has(k) && roster.has(k)) { seen.add(k); out.push(n); }
  }
  return out;
}

/**
 * What the Me button follows next: the first present character, or the one after the one being followed (wrapping).
 * With a single character present, pressing it again returns it, which the caller reads as "stop" via toggleFollow.
 */
export function nextMe(present: readonly string[], followed: string | null): string | null {
  if (!present.length) return null;
  const f = followed?.toLowerCase() ?? null;
  const i = f ? present.findIndex(n => n.toLowerCase() === f) : -1;
  return present[(i + 1) % present.length];
}

export const meSet = (mine: readonly string[]): Set<string> => new Set(mine.map(n => n.toLowerCase()));
