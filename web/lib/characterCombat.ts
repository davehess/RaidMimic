// Pure mapping for /character/<name>/combat: the rows of the `character_combat_trends` RPC in, the numbers
// the page shows out. No I/O, no React, so test/character-combat.test.js can run every function as behaviour.
//
// What the data is: one row per fight (oldest first, at most 500) with the character's damage by ability and,
// only where THEY uploaded, what they took. EverQuest does not log damage before mitigation, so "avoidance"
// here is swings avoided (miss / dodge / parry / riposte / block), never damage mitigated.

export type SkillStat = {
  hits: number;
  dmg: number;
  max?: number;
  min?: number;
  /** 16-bucket log2 histogram of hit sizes: bucket i covers [2^i, 2^(i+1)). Optional (a later agent version). */
  h?: number[];
};

export type Taken = {
  hits: number;
  damageTaken: number;
  misses: number;
  dodges: number;
  parries: number;
  ripostes: number;
  blocks: number;
  invulns: number;
  rampageHits: number;
  rampageDmg: number;
};

export type Weave = { rounds: number; roundsWithSpecial: number; specials: number; avgRoundGapMs: number; lateRounds: number };

export type CombatFight = {
  encounter_id: number;
  started_at: string;
  boss: string | null;
  duration: number | null; // seconds
  total_damage: number;
  dps: number;
  by_skill: Record<string, SkillStat> | null;
  taken: Taken | null;
  weave?: Weave | null;
};

/** Who may open the page. One constant so the guild lead's pick flips it in one place. */
export const COMBAT_VISIBILITY: 'OWNER' | 'GUILD' = 'OWNER';

export const HARM_TOUCH_KEY = 'harm touch';
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ── Raid nights ─────────────────────────────────────────────────────────────────────────────────────────────
// Raids start 8:30 PM ET and plans run to 12:30 AM, so a fight after midnight belongs to the night before.
// Shifting back six hours puts every raid-window fight on one Eastern calendar day.
export function nightKey(iso: string, tz = 'America/New_York'): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t - 6 * 3600_000).toLocaleDateString('en-CA', { timeZone: tz });
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Avoidance ───────────────────────────────────────────────────────────────────────────────────────────────
export type Avoidance = {
  swings: number;
  avoided: number;
  pct: number | null; // 0..100, null when no swings were seen
  split: { misses: number; dodges: number; parries: number; ripostes: number; blocks: number };
};

export function avoidance(t: Taken | null | undefined): Avoidance {
  const split = {
    misses: num(t?.misses), dodges: num(t?.dodges), parries: num(t?.parries), ripostes: num(t?.ripostes), blocks: num(t?.blocks),
  };
  const avoided = split.misses + split.dodges + split.parries + split.ripostes + split.blocks;
  const swings = avoided + num(t?.hits);
  return { swings, avoided, pct: swings > 0 ? (avoided / swings) * 100 : null, split };
}

export function sumTaken(list: Array<Taken | null | undefined>): Taken {
  const z: Taken = { hits: 0, damageTaken: 0, misses: 0, dodges: 0, parries: 0, ripostes: 0, blocks: 0, invulns: 0, rampageHits: 0, rampageDmg: 0 };
  for (const t of list) {
    if (!t) continue;
    for (const k of Object.keys(z) as (keyof Taken)[]) z[k] += num(t[k]);
  }
  return z;
}

export type TakenSummary = Avoidance & {
  fights: number;
  damageTaken: number;
  damagePerFight: number;
  damagePerMin: number | null; // null when no fight duration is known
  rampageSharePct: number | null; // share of damage taken that came from rampage
};

/** Summary over the fights that carry `taken` (the character's own uploads only). */
export function summarizeTaken(fights: CombatFight[]): TakenSummary {
  const withTaken = fights.filter(f => f.taken);
  const sum = sumTaken(withTaken.map(f => f.taken));
  const secs = withTaken.reduce((s, f) => s + num(f.duration), 0);
  return {
    ...avoidance(sum),
    fights: withTaken.length,
    damageTaken: sum.damageTaken,
    damagePerFight: withTaken.length ? sum.damageTaken / withTaken.length : 0,
    damagePerMin: secs > 0 ? sum.damageTaken / (secs / 60) : null,
    rampageSharePct: sum.damageTaken > 0 ? (sum.rampageDmg / sum.damageTaken) * 100 : null,
  };
}

// ── Per night ───────────────────────────────────────────────────────────────────────────────────────────────
export type Night = {
  night: string; // YYYY-MM-DD (raid night)
  fights: number;
  totalDamage: number;
  seconds: number;
  dps: number; // night damage / night fight time (time-weighted, not a mean of per-fight DPS)
  bestDps: number;
  taken: TakenSummary | null; // null when no fight that night had `taken`
};

export function aggregateNights(fights: CombatFight[], tz?: string): Night[] {
  const by = new Map<string, CombatFight[]>();
  for (const f of fights) {
    const k = nightKey(f.started_at, tz);
    if (!k) continue;
    (by.get(k) ?? by.set(k, []).get(k)!).push(f);
  }
  return [...by.keys()].sort().map(night => {
    const fs = by.get(night)!;
    const totalDamage = fs.reduce((s, f) => s + num(f.total_damage), 0);
    const seconds = fs.reduce((s, f) => s + num(f.duration), 0);
    const t = summarizeTaken(fs);
    return {
      night,
      fights: fs.length,
      totalDamage,
      seconds,
      dps: seconds > 0 ? totalDamage / seconds : 0,
      bestDps: Math.max(0, ...fs.map(f => num(f.dps))),
      taken: t.fights > 0 ? t : null,
    };
  });
}

export type Spread = { best: CombatFight | null; typical: number; worst: CombatFight | null };

/** Best / worst fight by DPS and the median DPS between them. Fights with no DPS (0) are not "worst". */
export function dpsSpread(fights: CombatFight[]): Spread {
  const live = fights.filter(f => num(f.dps) > 0);
  if (!live.length) return { best: null, typical: 0, worst: null };
  let best = live[0], worst = live[0];
  for (const f of live) { if (f.dps > best.dps) best = f; if (f.dps < worst.dps) worst = f; }
  return { best, typical: median(live.map(f => f.dps)), worst };
}

// ── Histogram quantiles ─────────────────────────────────────────────────────────────────────────────────────
export function mergeHist(list: Array<number[] | undefined | null>): number[] | null {
  let out: number[] | null = null;
  for (const h of list) {
    if (!Array.isArray(h) || h.length === 0) continue;
    out ??= new Array(Math.max(16, h.length)).fill(0);
    if (h.length > out.length) out = [...out, ...new Array(h.length - out.length).fill(0)];
    h.forEach((n, i) => { out![i] += num(n); });
  }
  return out;
}

/**
 * The q-th quantile (0..1) of hit sizes from a log2 histogram. Bucket i covers [2^i, 2^(i+1)); inside the
 * bucket the value is placed by linear interpolation, so the answer is an estimate good to about the bucket.
 * Returns null for an empty or missing histogram.
 */
export function histQuantile(h: number[] | null | undefined, q: number): number | null {
  if (!h) return null;
  const total = h.reduce((s, n) => s + num(n), 0);
  if (total <= 0) return null;
  const target = Math.min(Math.max(q, 0), 1) * total;
  let seen = 0;
  for (let i = 0; i < h.length; i++) {
    const n = num(h[i]);
    if (n > 0 && seen + n >= target) {
      const lo = 2 ** i, hi = 2 ** (i + 1);
      return lo + ((target - seen) / n) * (hi - lo);
    }
    seen += n;
  }
  return 2 ** h.length;
}

// ── Per ability ─────────────────────────────────────────────────────────────────────────────────────────────
export type AbilityRow = {
  key: string; // as sent, e.g. "flying kick" or "ds:..."
  name: string;
  damageShield: boolean;
  hits: number;
  dmg: number;
  mean: number;
  sharePct: number; // of all damage this range (abilities + damage shields)
  max: number | null;
  min: number | null;
  median: number | null; // from the histogram; null until the agent sends one
  hasHist: boolean;
};

export function abilityTable(fights: CombatFight[]): AbilityRow[] {
  type Acc = { hits: number; dmg: number; max: number | null; min: number | null; hs: number[][] };
  const acc = new Map<string, Acc>();
  for (const f of fights) {
    for (const [key, s] of Object.entries(f.by_skill ?? {})) {
      const a = acc.get(key) ?? { hits: 0, dmg: 0, max: null, min: null, hs: [] };
      a.hits += num(s.hits);
      a.dmg += num(s.dmg);
      if (typeof s.max === 'number') a.max = a.max == null ? s.max : Math.max(a.max, s.max);
      if (typeof s.min === 'number') a.min = a.min == null ? s.min : Math.min(a.min, s.min);
      if (Array.isArray(s.h)) a.hs.push(s.h);
      acc.set(key, a);
    }
  }
  const all = [...acc.values()].reduce((s, a) => s + a.dmg, 0);
  return [...acc.entries()]
    .map(([key, a]) => {
      const merged = mergeHist(a.hs);
      const ds = key.startsWith('ds:');
      return {
        key,
        name: ds ? key.slice(3) : key,
        damageShield: ds,
        hits: a.hits,
        dmg: a.dmg,
        mean: a.hits > 0 ? a.dmg / a.hits : 0,
        sharePct: all > 0 ? (a.dmg / all) * 100 : 0,
        max: a.max,
        min: a.min,
        median: histQuantile(merged, 0.5),
        hasHist: !!merged,
      };
    })
    .sort((x, y) => y.dmg - x.dmg);
}

/** Each night's share of damage by ability, for the top `topN` abilities of the whole range (the rest are "other"). */
export function abilityShareByNight(fights: CombatFight[], topN = 5, tz?: string) {
  const top = abilityTable(fights).slice(0, topN).map(a => a.key);
  const nights = new Map<string, Map<string, number>>();
  for (const f of fights) {
    const k = nightKey(f.started_at, tz);
    if (!k) continue;
    const m = nights.get(k) ?? nights.set(k, new Map()).get(k)!;
    for (const [key, s] of Object.entries(f.by_skill ?? {})) {
      const bucket = top.includes(key) ? key : 'other';
      m.set(bucket, (m.get(bucket) ?? 0) + num(s.dmg));
    }
  }
  const keys = [...top, 'other'];
  return {
    keys,
    nights: [...nights.keys()].sort().map(night => {
      const m = nights.get(night)!;
      const total = [...m.values()].reduce((s, n) => s + n, 0);
      return { night, share: Object.fromEntries(keys.map(k => [k, total > 0 ? ((m.get(k) ?? 0) / total) * 100 : 0])) as Record<string, number> };
    }),
  };
}

// ── Harm Touch (and any once-per-period ability) ─────────────────────────────────────────────────────────────
export function harmTouch(fights: CombatFight[]): { count: number; total: number; fights: number } | null {
  let count = 0, total = 0, n = 0;
  for (const f of fights) {
    const s = f.by_skill?.[HARM_TOUCH_KEY];
    if (!s) continue;
    count += num(s.hits); total += num(s.dmg); n++;
  }
  return n > 0 ? { count, total, fights: n } : null;
}

// ── Monk weave ──────────────────────────────────────────────────────────────────────────────────────────────
export type WeaveSummary = {
  fights: number;
  rounds: number;
  specialRoundPct: number | null; // rounds with a special / rounds
  lateRoundPct: number | null;    // late rounds after a special (clips) / rounds with a special
  specialsPerMin: number | null;
  avgRoundGapMs: number | null;   // weighted by rounds
};

export function summarizeWeave(fights: CombatFight[]): WeaveSummary | null {
  const w = fights.filter(f => f.weave && num(f.weave.rounds) > 0);
  if (!w.length) return null;
  let rounds = 0, withSpecial = 0, specials = 0, late = 0, gap = 0, secs = 0;
  for (const f of w) {
    const x = f.weave!;
    rounds += num(x.rounds); withSpecial += num(x.roundsWithSpecial); specials += num(x.specials);
    late += num(x.lateRounds); gap += num(x.avgRoundGapMs) * num(x.rounds); secs += num(f.duration);
  }
  return {
    fights: w.length,
    rounds,
    specialRoundPct: (withSpecial / rounds) * 100,
    lateRoundPct: withSpecial > 0 ? (late / withSpecial) * 100 : null,
    specialsPerMin: secs > 0 ? specials / (secs / 60) : null,
    avgRoundGapMs: gap / rounds,
  };
}

export function weaveByNight(fights: CombatFight[], tz?: string): Array<{ night: string; weave: WeaveSummary }> {
  const by = new Map<string, CombatFight[]>();
  for (const f of fights) {
    const k = nightKey(f.started_at, tz);
    if (k) (by.get(k) ?? by.set(k, []).get(k)!).push(f);
  }
  return [...by.keys()].sort().flatMap(night => {
    const weave = summarizeWeave(by.get(night)!);
    return weave ? [{ night, weave }] : [];
  });
}

/** `?days=` → 30 or 90 (anything else is 90). */
export function parseDays(raw: string | string[] | undefined): 30 | 90 {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === '30' ? 30 : 90;
}

/** The RPC returns jsonb; keep only well-formed rows, oldest first. */
export function cleanFights(raw: unknown): CombatFight[] {
  if (!Array.isArray(raw)) return [];
  return (raw as CombatFight[])
    .filter(f => f && typeof f.started_at === 'string' && Number.isFinite(new Date(f.started_at).getTime()))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}
