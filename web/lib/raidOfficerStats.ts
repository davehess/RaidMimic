// Officer-only raid stats for the session review: deaths, time standing still, distance from the raid, far-off episodes.
// Pure: no React, no Supabase. The page builds it ONLY for an officer (app/raid/session/page.tsx) and never on the
// public share page.
//
// Every figure is a count of what the recording SAW: a position is known when any Mimic user in the raider's zone
// reported the raid window, frames about 3 s apart. A raider the recording has no frames for has no row, and a long
// gap in a raider's frames is "not tracked", never "still".
//
// FAR-OFF is a neutral marker, not a verdict: a raider whose distance from the raid centre stays above the raid's own
// mean + 2 standard deviations, outside mass-casualty fights and moments when the whole raid stood still.
import { anonName, nameKey, type AnonMap } from './raidSession';
import { massDeaths } from './nightSlices';
import type { ReplayFrame, ReplayRaider } from './raidReplay';

/** Position change under this many map units between two frames of the same raider counts as not moving. */
export const STILL_UNITS = 8;
/** At least this many deaths inside 60 s make a mass-casualty window (padded MASS_PAD_MS each side). */
export const MASS_DEATHS = 5;
export const MASS_PAD_MS = 60_000;
/** A frame where at least this share of the raid is still is a raid-wide still frame (needs RAID_STILL_MIN raiders measured). */
export const RAID_STILL_SHARE = 0.8;
export const RAID_STILL_MIN = 5;
/** A raider is far in a frame above mean + this many standard deviations of the raid's distances. */
export const FAR_SIGMA = 2;
/** Flagged at this many far episodes, or one episode this long. */
export const FAR_EPISODES = 3;
export const FAR_MINUTES = 5;
/** An episode shorter than this many frames is a blip, not an episode. */
export const FAR_MIN_FRAMES = 2;
/** ...and one shorter than this is a pull, a kite or a run to a corpse, not time away. With only the frame rule, the
 *  Plane of Fire night (2026-11-19) flagged 35 of 50 raiders on episodes that never lasted a minute. */
export const FAR_EPISODE_MIN_MS = 60_000;
/** Frames are about this far apart; one missing frame is tolerated, more is a break in the raider's track. */
export const FRAME_STEP_MS = 3_000;
export const GAP_TOLERANCE_MS = 2 * FRAME_STEP_MS + 1_500;

export type OfficerStatsRow = {
  name: string;
  deaths: number;
  /** Longest unbroken stretch not moving, ms. */
  stillMs: number;
  /** Share (0..1) of the tracked time spent still. */
  stillShare: number;
  /** Mean distance from the raid centre over frames in the raid's zone, map units; null when none. */
  avgDist: number | null;
  /** Time in another zone than the raid's, ms. */
  outMs: number;
  /** Time the raider was tracked, ms. */
  trackedMs: number;
  farEpisodes: number;
  farLongestMs: number;
  far: boolean;
};
export type OfficerStats = { rows: OfficerStatsRow[]; frames: number };

export type OfficerStatsInput = {
  frames: readonly ReplayFrame[];
  /** Times of every player death in the window (the page's own death marks). */
  deathTimes: readonly number[];
  /** Deaths per name, as the page counts them (real names; labelled here). */
  deathCounts: readonly { name: string; n: number }[];
  anon: AnonMap;
  /** Shortest far episode that counts (default FAR_EPISODE_MIN_MS). */
  episodeMinMs?: number;
};

const PET = /`s\s+(pet|warder|ward|familiar|companion)$/i;

const median = (v: number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The busiest zone of a frame's raiders (a tie to the name that sorts first); null with no zoned raider. */
export function raidZoneOf(raiders: readonly ReplayRaider[]): string | null {
  const c = new Map<string, number>();
  for (const r of raiders) if (r.zone) c.set(r.zone, (c.get(r.zone) ?? 0) + 1);
  let best: string | null = null, n = 0;
  for (const [z, k] of c) if (k > n || (k === n && best !== null && z < best)) { best = z; n = k; }
  return best;
}

/** Raid centre: the median x and median y of the raiders (z ignored). */
export function raidCentre(raiders: readonly { x: number; y: number }[]): { x: number; y: number } {
  return { x: median(raiders.map(r => r.x)), y: median(raiders.map(r => r.y)) };
}

/** Mean and population standard deviation. */
export function meanSd(v: readonly number[]): { mean: number; sd: number } {
  if (!v.length) return { mean: 0, sd: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) };
}

/** Windows [from, to] in which a mass-casualty fight was on: MASS_DEATHS deaths in 60 s, padded, joined. */
export function massWindows(deathTimes: readonly number[], min = MASS_DEATHS, pad = MASS_PAD_MS): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const m of massDeaths(deathTimes, 60_000, min)) {
    const w = { from: m.fromMs - pad, to: m.toMs + pad };
    const last = out[out.length - 1];
    if (last && w.from <= last.to) last.to = Math.max(last.to, w.to); else out.push(w);
  }
  return out;
}

type Pt = { t: number; x: number; y: number; zone: string | null };

/**
 * One raider's still stretches from their own frames, oldest first. A step between two frames is still when the zone
 * is the same and the position moved less than `still` units; a gap beyond GAP_TOLERANCE_MS (more than one missing
 * frame) ends the stretch and counts as untracked.
 */
export function stillRuns(pts: readonly Pt[], still = STILL_UNITS): { longestMs: number; stillMs: number; trackedMs: number } {
  let longest = 0, stillMs = 0, tracked = 0, runStart: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dt = b.t - a.t;
    if (dt <= 0 || dt > GAP_TOLERANCE_MS) { runStart = null; continue; }
    tracked += dt;
    const isStill = a.zone === b.zone && Math.hypot(b.x - a.x, b.y - a.y) < still;
    if (isStill) {
      stillMs += dt;
      if (runStart == null) runStart = a.t;
      longest = Math.max(longest, b.t - runStart);
    } else runStart = null;
  }
  return { longestMs: longest, stillMs, trackedMs: tracked };
}

export function buildOfficerStats(i: OfficerStatsInput): OfficerStats {
  const frames = [...i.frames].sort((a, b) => a.t - b.t);
  const mass = massWindows(i.deathTimes);
  const inMass = (t: number) => mass.some(w => t >= w.from && t <= w.to);

  // Each raider's own frames, deduped per frame, pets left out.
  const track = new Map<string, { label: string; pts: Pt[] }>();
  const perFrame: { t: number; key: string; r: ReplayRaider }[][] = [];
  for (const f of frames) {
    const seen = new Set<string>();
    const row: { t: number; key: string; r: ReplayRaider }[] = [];
    for (const r of f.raiders) {
      const k = nameKey(r.name);
      if (!k || seen.has(k) || PET.test(String(r.name).trim())) continue;
      seen.add(k);
      row.push({ t: f.t, key: k, r });
      let tr = track.get(k);
      if (!tr) { tr = { label: anonName(i.anon, String(r.name).trim()), pts: [] }; track.set(k, tr); }
      tr.pts.push({ t: f.t, x: r.x, y: r.y, zone: r.zone });
    }
    perFrame.push(row);
  }

  // Raid-wide still frames: the share of raiders measured (a previous frame within tolerance) who did not move.
  const prev = new Map<string, Pt>();
  const raidStill: boolean[] = [];
  for (let n = 0; n < frames.length; n++) {
    let measured = 0, still = 0;
    for (const { key, r } of perFrame[n]) {
      const p = prev.get(key);
      const dt = p ? frames[n].t - p.t : 0;
      if (p && dt > 0 && dt <= GAP_TOLERANCE_MS) {
        measured++;
        if (p.zone === r.zone && Math.hypot(r.x - p.x, r.y - p.y) < STILL_UNITS) still++;
      }
      prev.set(key, { t: frames[n].t, x: r.x, y: r.y, zone: r.zone });
    }
    raidStill.push(measured >= RAID_STILL_MIN && still / measured >= RAID_STILL_SHARE);
  }

  // Distance, out-of-zone time and far episodes, frame by frame.
  type Acc = { dSum: number; dN: number; outMs: number; open: { start: number; last: number; n: number } | null; eps: { ms: number }[] };
  const acc = new Map<string, Acc>();
  const get = (k: string): Acc => { let a = acc.get(k); if (!a) { a = { dSum: 0, dN: 0, outMs: 0, open: null, eps: [] }; acc.set(k, a); } return a; };
  const close = (a: Acc) => {
    if (a.open && a.open.n >= FAR_MIN_FRAMES && a.open.last - a.open.start >= (i.episodeMinMs ?? FAR_EPISODE_MIN_MS)) a.eps.push({ ms: a.open.last - a.open.start });
    a.open = null;
  };
  // When each raider is next seen, to weigh their out-of-zone frames.
  const nextAt: Map<string, number>[] = new Array(frames.length);
  const cur = new Map<string, number>();
  for (let n = frames.length - 1; n >= 0; n--) {
    const m = new Map<string, number>();
    for (const { key } of perFrame[n]) { const x = cur.get(key); if (x != null) m.set(key, x); cur.set(key, frames[n].t); }
    nextAt[n] = m;
  }
  const weight = (n: number, key: string) => { const x = nextAt[n].get(key); return x != null && x - frames[n].t <= GAP_TOLERANCE_MS ? x - frames[n].t : FRAME_STEP_MS; };

  for (let n = 0; n < frames.length; n++) {
    const t = frames[n].t;
    const row = perFrame[n];
    const zone = raidZoneOf(row.map(x => x.r));
    const inZone = row.filter(x => x.r.zone === zone && zone);
    const excluded = inMass(t) || raidStill[n];
    if (excluded) for (const a of acc.values()) close(a);
    const c = inZone.length ? raidCentre(inZone.map(x => x.r)) : null;
    const dist = new Map<string, number>();
    if (c) for (const x of inZone) dist.set(x.key, Math.hypot(x.r.x - c.x, x.r.y - c.y));
    const { mean, sd } = meanSd([...dist.values()]);
    for (const { key, r } of row) {
      const a = get(key);
      if (!zone || r.zone !== zone) {
        a.outMs += weight(n, key);
        close(a);
        continue;
      }
      const d = dist.get(key)!;
      a.dSum += d; a.dN++;
      if (excluded) continue;
      if (sd > 0 && d > mean + FAR_SIGMA * sd) {
        if (a.open && t - a.open.last <= GAP_TOLERANCE_MS) { a.open.last = t; a.open.n++; }
        else { close(a); a.open = { start: t, last: t, n: 1 }; }
      } else close(a);
    }
  }
  for (const a of acc.values()) close(a);

  const deaths = new Map<string, number>();
  for (const d of i.deathCounts) { const k = nameKey(d.name); if (k) deaths.set(k, (deaths.get(k) ?? 0) + d.n); }

  const rows: OfficerStatsRow[] = [];
  for (const [k, tr] of track) {
    const s = stillRuns(tr.pts);
    const a = acc.get(k) ?? { dSum: 0, dN: 0, outMs: 0, open: null, eps: [] };
    const longest = a.eps.reduce((m, e) => Math.max(m, e.ms), 0);
    rows.push({
      name: tr.label,
      deaths: deaths.get(k) ?? 0,
      stillMs: s.longestMs,
      stillShare: s.trackedMs > 0 ? s.stillMs / s.trackedMs : 0,
      avgDist: a.dN ? a.dSum / a.dN : null,
      outMs: a.outMs,
      trackedMs: s.trackedMs,
      farEpisodes: a.eps.length,
      farLongestMs: longest,
      far: a.eps.length >= FAR_EPISODES || longest >= FAR_MINUTES * 60_000,
    });
  }
  rows.sort((x, y) => y.stillShare - x.stillShare || x.name.localeCompare(y.name));   // ties on the SHOWN name
  return { rows, frames: frames.length };
}

/** The viewer gate: `build` runs only for an officer, so nothing is computed (or serialized) for anyone else. */
export function officerStatsFor(officer: boolean, build: () => OfficerStats): OfficerStats | null {
  return officer ? build() : null;
}

/** m:ss */
export const fmtMs = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
