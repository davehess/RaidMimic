// test/raid-officer-stats.test.js: the officer raid stats of the session review (web/lib/raidOfficerStats.ts).
// Pure functions driven with invented raiders; plus source checks that the officer card is built and sent only to an
// officer and never reaches the public share page.
// Run: npx vitest run test/raid-officer-stats.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildOfficerStats, officerStatsFor, stillRuns, massWindows, raidCentre, raidZoneOf, meanSd, fmtMs,
  STILL_UNITS, FAR_EPISODES, FAR_MINUTES, GAP_TOLERANCE_MS,
} from '../web/lib/raidOfficerStats.ts';
import { anonLabels } from '../web/lib/raidSession.ts';
import { ROOT, readSource, stripJs } from './_source-slice.js';

const T0 = Date.parse('2026-11-20T01:02:00Z');
const STEP = 3000;
const rd = (name, x, y, zone = 'z') => ({ i: 0, name, cls: null, group: null, level: null, x, y, z: 0, h: null, hp: null, zone });
const frame = (n, raiders) => ({ t: T0 + n * STEP, raiders });
const row = (stats, name) => stats.rows.find(r => r.name === name);
// episodeMinMs 0: these cases check the episode logic with short frame runs; the 60 s floor has its own case below.
const run = (frames, extra = {}) => buildOfficerStats({ frames, deathTimes: [], deathCounts: [], anon: new Map(), episodeMinMs: 0, ...extra });

// Nine raiders who keep moving (alternating 20 units, so never "still") around (0,0), plus `far(n)` -> the odd one's raider.
const NINE = ['Aldenmar', 'Brackwyn', 'Corvale', 'Rethlan', 'Nyssara', 'Zarrin', 'Hollis', 'Tavrin', 'Mirell'];
const crowd = (n) => NINE.map((nm, k) => rd(nm, (n % 2 ? 20 : -20) + k, k - 4));
const farFor = (set) => (n) => (set(n) ? rd('Vexmoor', 600, 0) : rd('Vexmoor', 5 + (n % 2 ? 20 : -20), 0));

describe('still runs', () => {
  const p = (n, x, y = 0, zone = 'z') => ({ t: T0 + n * STEP, x, y, zone });
  it('jitter under the threshold is still; a real step ends the stretch', () => {
    const pts = [p(0, 0), p(1, 3), p(2, -2), p(3, 4), p(4, 500), p(5, 501)];
    const r = stillRuns(pts);
    expect(r.longestMs).toBe(3 * STEP);          // frames 0..3
    expect(r.stillMs).toBe(4 * STEP);            // 3 steps + the last jitter
    expect(r.trackedMs).toBe(5 * STEP);
  });
  it('exactly STILL_UNITS is a move', () => {
    expect(stillRuns([p(0, 0), p(1, STILL_UNITS)]).stillMs).toBe(0);
    expect(stillRuns([p(0, 0), p(1, STILL_UNITS - 0.1)]).stillMs).toBe(STEP);
  });
  it('one missing frame is bridged, two are a break (not tracked, not still)', () => {
    const one = stillRuns([p(0, 0), p(2, 1), p(3, 1)]);   // frame 1 missing: gap 6 s
    expect(one.longestMs).toBe(3 * STEP);
    const two = stillRuns([p(0, 0), p(3, 1), p(4, 1)]);   // gap 9 s > tolerance
    expect(9000).toBeGreaterThan(GAP_TOLERANCE_MS);
    expect(two.longestMs).toBe(STEP);
    expect(two.trackedMs).toBe(STEP);
  });
  it('a zone change is a move', () => {
    expect(stillRuns([p(0, 0, 0, 'a'), p(1, 0, 0, 'b')]).stillMs).toBe(0);
  });
});

describe('the 60 s episode floor (the Plane of Fire night flagged 35 of 50 on sub-minute episodes)', () => {
  it('far stretches under 60 s are not episodes; one of 60 s or more is', () => {
    // three 30 s far bursts (10 frames each) separated by 30 s near: no episodes at the default floor
    const shortFar = (n) => (n % 20) < 10;
    const short = Array.from({ length: 60 }, (_, n) => frame(n, [...crowd(n), farFor(shortFar)(n)]));
    const d = buildOfficerStats({ frames: short, deathTimes: [], deathCounts: [], anon: new Map() });
    expect(row(d, 'Vexmoor').farEpisodes).toBe(0);
    expect(row(d, 'Vexmoor').far).toBe(false);
    // the same raider far for 25 frames (72 s from first to last far frame): one episode at the default floor
    const long = Array.from({ length: 40 }, (_, n) => frame(n, [...crowd(n), farFor(n2 => n2 >= 5 && n2 < 30)(n)]));
    const l = buildOfficerStats({ frames: long, deathTimes: [], deathCounts: [], anon: new Map() });
    expect(row(l, 'Vexmoor').farEpisodes).toBe(1);
  });
});

describe('centre, spread, zone', () => {
  it('centre is the median x and median y, z ignored', () => {
    expect(raidCentre([{ x: 0, y: 10 }, { x: 1, y: 11 }, { x: 1000, y: 12 }])).toEqual({ x: 1, y: 11 });
    expect(raidCentre([{ x: 0, y: 0 }, { x: 10, y: 4 }])).toEqual({ x: 5, y: 2 });
  });
  it('mean and population SD', () => {
    const { mean, sd } = meanSd([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(mean).toBe(5);
    expect(sd).toBe(2);
  });
  it('the raid zone is the busiest zone, ties to the name that sorts first', () => {
    expect(raidZoneOf([rd('A', 0, 0, 'b'), rd('B', 0, 0, 'a')])).toBe('a');
    expect(raidZoneOf([rd('A', 0, 0, 'b'), rd('B', 0, 0, 'b'), rd('C', 0, 0, 'a')])).toBe('b');
  });
});

describe('mass-casualty windows', () => {
  it('5 deaths in 60 s open a window padded 60 s each side; 4 do not', () => {
    const d = [0, 10, 20, 30, 40].map(s => T0 + s * 1000);
    expect(massWindows(d)).toEqual([{ from: T0 - 60_000, to: T0 + 40_000 + 60_000 }]);
    expect(massWindows(d.slice(1))).toEqual([]);
  });
});

describe('the table', () => {
  it('longest still, % still and avg distance', () => {
    const frames = [];
    for (let n = 0; n < 40; n++) {
      const r = crowd(n);
      // Sitter stands still frames 10..29, then walks
      r.push(rd('Sitter', n >= 10 && n < 30 ? 2 + (n % 2) : 2 + n * 30, 0));
      frames.push(frame(n, r));
    }
    const s = run(frames);
    const sit = row(s, 'Sitter');
    expect(sit.stillMs).toBeGreaterThanOrEqual(19 * STEP);
    expect(sit.stillMs).toBeLessThanOrEqual(21 * STEP);
    expect(sit.stillShare).toBeGreaterThan(0.45);
    expect(sit.stillShare).toBeLessThan(0.6);
    expect(row(s, 'Aldenmar').stillMs).toBe(0);
    expect(row(s, 'Aldenmar').avgDist).toBeGreaterThan(0);
  });

  it('deaths come from the page counts, by name', () => {
    const s = run([frame(0, crowd(0)), frame(1, crowd(1))], { deathCounts: [{ name: 'aldenmar', n: 3 }, { name: 'Nobody', n: 9 }] });
    expect(row(s, 'Aldenmar').deaths).toBe(3);
    expect(row(s, 'Brackwyn').deaths).toBe(0);
    expect(s.rows.some(r => r.name === 'Nobody')).toBe(false);
  });

  it('pets are not raiders', () => {
    const s = run([frame(0, [...crowd(0), rd('Aldenmar`s pet', 0, 0)]), frame(1, [...crowd(1), rd('Aldenmar`s pet', 0, 0)])]);
    expect(s.rows.some(r => /pet/.test(r.name))).toBe(false);
  });

  it('a raider in another zone is "out of raid zone" time, not distance', () => {
    const frames = [];
    for (let n = 0; n < 10; n++) frames.push(frame(n, [...crowd(n), rd('Vexmoor', 9000, 9000, 'other')]));
    const v = row(run(frames), 'Vexmoor');
    expect(v.avgDist).toBeNull();
    expect(v.outMs).toBe(10 * STEP);
    expect(v.farEpisodes).toBe(0);
    // and the others' distances are not stretched by the far-away raider
    expect(row(run(frames), 'Aldenmar').avgDist).toBeLessThan(60);
  });

  it('2 SD rule: one raider far from a crowd is far; near the crowd is not', () => {
    const far = farFor(() => true);
    const frames = [];
    for (let n = 0; n < 6; n++) frames.push(frame(n, [...crowd(n), far(n)]));
    expect(row(run(frames), 'Vexmoor').farEpisodes).toBe(1);
    expect(row(run(frames), 'Vexmoor').farLongestMs).toBe(5 * STEP);
    const near = farFor(() => false);
    const f2 = [];
    for (let n = 0; n < 6; n++) f2.push(frame(n, [...crowd(n), near(n)]));
    expect(row(run(f2), 'Vexmoor').farEpisodes).toBe(0);
  });

  it('episodes count: three bursts flag, two do not; one-frame blips do not count', () => {
    const burst = (starts) => {
      const far = farFor(n => starts.some(([a, b]) => n >= a && n <= b));
      const frames = [];
      for (let n = 0; n < 60; n++) frames.push(frame(n, [...crowd(n), far(n)]));
      return row(run(frames), 'Vexmoor');
    };
    const three = burst([[2, 8], [20, 26], [40, 46]]);
    expect(three.farEpisodes).toBe(3);
    expect(three.far).toBe(FAR_EPISODES <= 3);
    const two = burst([[2, 8], [20, 26]]);
    expect(two.farEpisodes).toBe(2);
    expect(two.far).toBe(false);
    const blips = burst([[2, 2], [10, 10], [20, 20], [30, 30]]);
    expect(blips.farEpisodes).toBe(0);
  });

  it('one far frame missing inside an episode is bridged; two make two episodes', () => {
    const frames = (gone) => {
      const far = farFor(() => true);
      const out = [];
      for (let n = 0; n < 20; n++) {
        const r = crowd(n);
        if (!gone.includes(n)) r.push(far(n));
        out.push(frame(n, r));
      }
      return row(run(out), 'Vexmoor');
    };
    expect(frames([8]).farEpisodes).toBe(1);
    expect(frames([8, 9]).farEpisodes).toBe(2);
  });

  it('a single episode of FAR_MINUTES flags on its own', () => {
    const far = farFor(() => true);
    const n = Math.ceil((FAR_MINUTES * 60_000) / STEP) + 1;
    const frames = [];
    for (let k = 0; k < n; k++) frames.push(frame(k, [...crowd(k), far(k)]));
    const v = row(run(frames), 'Vexmoor');
    expect(v.farEpisodes).toBe(1);
    expect(v.farLongestMs).toBeGreaterThanOrEqual(FAR_MINUTES * 60_000);
    expect(v.far).toBe(true);
    expect(fmtMs(v.farLongestMs)).toMatch(/^5:0\d$/);
  });

  it('frames inside a mass-casualty window are left out', () => {
    const far = farFor(() => true);
    const frames = [];
    for (let k = 0; k < 40; k++) frames.push(frame(k, [...crowd(k), far(k)]));
    // five deaths at 30..34 s: window 30 s - 60 s .. 34 s + 60 s covers frames 0..31 (t 0..93 s)
    const deathTimes = [30, 31, 32, 33, 34].map(s => T0 + s * 1000);
    const v = row(run(frames, { deathTimes }), 'Vexmoor');
    // only frames after t = 94 s remain: 32..39 -> 8 frames, an episode of 7 steps
    expect(v.farEpisodes).toBe(1);
    expect(v.farLongestMs).toBe(7 * STEP);
    // and four deaths do not exclude anything
    const four = row(run(frames, { deathTimes: deathTimes.slice(1) }), 'Vexmoor');
    expect(four.farLongestMs).toBe(39 * STEP);
  });

  it('frames where the whole raid stood still are left out', () => {
    // Everyone, the far raider included, stands still for frames 10..29; the far raider is far the whole time.
    const frames = [];
    for (let k = 0; k < 40; k++) {
      const still = k >= 10 && k < 30;
      const r = NINE.map((nm, i) => rd(nm, (still ? 0 : k % 2 ? 20 : -20) + i, i - 4));
      r.push(rd('Vexmoor', 600, 0 + (still ? 0 : (k % 2) * 30)));
      frames.push(frame(k, r));
    }
    const v = row(run(frames), 'Vexmoor');
    // Far frames outside the still window: 0..10 (frame 10 is the first still step, itself still) and 30..39
    expect(v.farEpisodes).toBe(2);
    expect(v.farLongestMs).toBeLessThan(11 * STEP);
    expect(v.farLongestMs).toBeGreaterThanOrEqual(8 * STEP);
  });

  it('opted-out raiders show as their label and never by name', () => {
    const anon = anonLabels([{ name: 'Hushed', class: 'Wizard', exclude_from_stats: true }]);
    const far = (n) => rd('Hushed', 600, 0);
    const frames = [];
    for (let k = 0; k < 6; k++) frames.push(frame(k, [...crowd(k), far(k)]));
    const s = run(frames, { anon, deathCounts: [{ name: 'Hushed', n: 2 }] });
    expect(s.rows.some(r => /hushed/i.test(r.name))).toBe(false);
    const w = s.rows.find(r => /^Wizard/.test(r.name));
    expect(w.deaths).toBe(2);
    expect(w.farEpisodes).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/hushed/i);
  });

  it('a raider with no frames has no row; a raid with no frames has no rows', () => {
    expect(run([]).rows).toEqual([]);
  });
});

describe('officer gate', () => {
  it('build runs only for an officer', () => {
    let called = 0;
    const build = () => { called++; return { rows: [], frames: 0 }; };
    expect(officerStatsFor(false, build)).toBeNull();
    expect(called).toBe(0);
    expect(officerStatsFor(true, build)).toEqual({ rows: [], frames: 0 });
    expect(called).toBe(1);
  });

  const page = stripJs(readSource(path.join(ROOT, 'web/app/raid/session/page.tsx')));
  it('the members page asks for the minutes and builds the stats only through the officer gate', () => {
    expect(page).toMatch(/stats:\s*officer\b/);
    expect(page).toMatch(/officerStatsFor\(officer,/);
    expect(page).toMatch(/officerStats=\{officerStats\}/);
    // the only place the stats builder is called is inside the gate's callback
    expect(page.match(/buildOfficerStats\(/g)).toHaveLength(1);
    expect(page).toMatch(/officerStatsFor\(officer, \(\) => buildOfficerStats\(/);
  });
  it('the loader keeps the rows only when asked, never for an isolated (share) review', () => {
    const load = stripJs(readSource(path.join(ROOT, 'web/lib/raidSessionLoad.ts')));
    expect(load).toMatch(/if \(opts\.stats && !opts\.isolate\) value\.statsIn/);
    expect(load).toMatch(/opts\.stats && !opts\.isolate \? '\|s' : ''/);   // its own cache entry
  });
  it('the review renders the card in member mode only, and the share page has no part of it', () => {
    const rev = stripJs(readSource(path.join(ROOT, 'web/app/raid/session/SessionReview.tsx')));
    expect(rev).toMatch(/mode\.kind === 'member' && officerStats && <OfficerStatsCard/);
    const share = stripJs(readSource(path.join(ROOT, 'web/app/share/raid/[token]/page.tsx')));
    expect(share).not.toMatch(/officerStats|OfficerStats|raidOfficerStats|stats:/);
    const routes = fs.readdirSync(path.join(ROOT, 'web/app/share'), { recursive: true }).filter(f => /\.tsx?$/.test(String(f)));
    for (const f of routes) expect(readSource(path.join(ROOT, 'web/app/share', String(f)))).not.toMatch(/raidOfficerStats/);
  });
});
