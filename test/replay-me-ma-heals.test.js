// test/replay-me-ma-heals.test.js — the replay's Me button, MA marker and heal arcs (web/lib/replayHeals.ts,
// web/lib/mainAssist.ts, web/lib/replayHealsLoad.ts).
//
// Behaviour for the pure parts; the MA parser is held to utils/mainAssist.js on shared lines (a port that drifts from
// the bot's rules fails here); the loader runs against a recording stand-in for the supabase client.
// Source assertions are made on comment-stripped text. Names are invented (Aldenmar, Brackwyn, Corvale ...).

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ROOT, readSource as rs, stripJs } from './_source-slice.js';
const readSource = (rel) => rs(path.join(ROOT, rel));
import * as heals from '../web/lib/replayHeals.ts';
import * as ma from '../web/lib/mainAssist.ts';
import { loadHealCasts, loadMaDeclarations, loadReplayExtras } from '../web/lib/replayHealsLoad.ts';

const bot = createRequire(import.meta.url)('../utils/mainAssist.js');

// ── MA parse parity ──────────────────────────────────────────────────────────
const LINES = [
  ['MA is Brackwyn', 'Aldenmar'], ['MA: Brackwyn', 'Aldenmar'], ['MA = Brackwyn', 'Aldenmar'], ['new MA Brackwyn', 'Aldenmar'],
  ['main assist is Brackwyn', 'Aldenmar'], ['Brackwyn is MA', 'Aldenmar'], ['Brackwyn is the MA', 'Aldenmar'],
  ['Brackwyn is main assist', 'Aldenmar'], ['assist Brackwyn', 'Aldenmar'], ['/assist Brackwyn', 'Aldenmar'],
  ['assist Brackwyn.', 'Aldenmar'], ['assist me', 'corvale'], ["I'm MA", 'Corvale'], ['I am the main assist', 'Corvale'],
  ['ASSIST ME ON ~<={ a gnoll pup }=>~', 'Corvale'], ['MA is now Brackwyn', 'Aldenmar'], ['MA is up', 'Aldenmar'],
  ['MA is the tank', 'Aldenmar'], ["assist Ulmarr's pet", 'Aldenmar'], ['MA is Zzzzzz', 'Aldenmar'],
  ['the MA is Rethlan', 'Aldenmar'], ['mA IS nyssara', 'Aldenmar'], ['', 'Aldenmar'], ['x'.repeat(130), 'Aldenmar'],
  ['MA Brackwyn pull now', 'Aldenmar'], ['Corvale = MA', 'Aldenmar'], ['assist me', ''],
];
const KNOWN = new Set(['brackwyn', 'rethlan', 'nyssara', 'corvale', 'aldenmar']);

describe('MA parser is a port of utils/mainAssist.js', () => {
  for (const [text, speaker] of LINES) {
    it(`"${text.slice(0, 40)}" said by "${speaker}"`, () => {
      const want = bot.parseDeclaration(text, speaker, n => KNOWN.has(n));
      expect(ma.parseMaDeclaration(text, speaker, n => KNOWN.has(n))).toBe(want ? want.name : null);
      // and with no roster check, as the bot calls it for the self shapes
      const w2 = bot.parseDeclaration(text, speaker);
      expect(ma.parseMaDeclaration(text, speaker)).toBe(w2 ? w2.name : null);
    });
  }
  it('the hold is the bot\'s own', () => { expect(ma.DECL_TTL_MS).toBe(bot.DECL_TTL_MS); });
});

describe('maAt', () => {
  const d = [{ t: 1000, name: 'Brackwyn' }, { t: 5000, name: 'Rethlan' }];
  it('none before the first declaration', () => { expect(ma.maAt(d, 999)).toBeNull(); });
  it('the newest at or before the moment', () => {
    expect(ma.maAt(d, 1000)).toBe('Brackwyn');
    expect(ma.maAt(d, 4999)).toBe('Brackwyn');
    expect(ma.maAt(d, 5000)).toBe('Rethlan');
  });
  it('expires after the hold', () => {
    expect(ma.maAt(d, 5000 + ma.DECL_TTL_MS)).toBe('Rethlan');
    expect(ma.maAt(d, 5000 + ma.DECL_TTL_MS + 1)).toBeNull();
  });
  it('mergeDecls dedups and sorts, and ignores junk', () => {
    const into = [];
    ma.mergeDecls(into, [[5000, 'Rethlan'], [1000, 'Brackwyn'], [1000, 'Brackwyn'], ['x', 1], null]);
    ma.mergeDecls(into, [[1000, 'Brackwyn']]);
    ma.mergeDecls(into, 'nope');
    expect(into).toEqual(d);
  });
});

// ── Heals ────────────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-11-18T01:00:00Z');
const row = (o) => ({ cast_at: new Date(T0 + (o.at ?? 0)).toISOString(), caster: 'Aldenmar', target: 'Brackwyn', cast_secs: 2.5, heal_amount: 900, ...o });

describe('healWire', () => {
  it('keeps heals with a window, drops the rest', () => {
    const w = heals.healWire([
      row({}), row({ heal_amount: null }), row({ heal_amount: 0 }), row({ cast_secs: null }), row({ cast_secs: 0 }), row({ target: '' }),
      row({ cast_at: 'nope' }),
    ]);
    expect(w).toEqual([[T0, 'Aldenmar', 'Brackwyn', 2.5]]);
  });
  it('a row read without heal_amount is trusted (the route already filtered)', () => {
    const { heal_amount, ...r } = row({});
    expect(heals.healWire([r]).length).toBe(1);
  });
});

describe('parseHealCasts', () => {
  it('sorts by start, caps the cast time, skips malformed rows', () => {
    const c = heals.parseHealCasts([[T0 + 5000, 'A', 'B', 3], [T0, 'C', 'D', 99], [1, 'x'], 'junk', [T0, '', 'D', 3], [T0, 'A', 'B', 0]]);
    expect(c.map(x => x.t)).toEqual([T0, T0 + 5000]);
    expect(c[0].secs).toBe(heals.MAX_HEAL_SECS);
  });
  it('non-array is no casts', () => { expect(heals.parseHealCasts(undefined)).toEqual([]); });
});

describe('arc active window', () => {
  const c = { t: T0, secs: 4 };
  it('from the cast start to the fade after it completes', () => {
    expect(heals.healActive(c, T0 - 1)).toBe(false);
    expect(heals.healActive(c, T0)).toBe(true);
    expect(heals.healActive(c, T0 + 4000 + heals.HEAL_FADE_MS - 1)).toBe(true);
    expect(heals.healActive(c, T0 + 4000 + heals.HEAL_FADE_MS)).toBe(false);
  });
});

describe('activeArcs', () => {
  const at = { Aldenmar: { x: 0, y: 0, z: 0, zone: 'z' }, Brackwyn: { x: 100, y: 0, z: 0, zone: 'z' }, Corvale: { x: 50, y: 50, z: 0, zone: 'other' } };
  const find = (n) => at[n[0].toUpperCase() + n.slice(1).toLowerCase()] ?? null;
  const casts = heals.parseHealCasts([
    [T0, 'Aldenmar', 'Brackwyn', 10],      // a Complete Healing
    [T0, 'Corvale', 'Brackwyn', 3],        // different zones: nothing
    [T0, 'Aldenmar', 'Nobody', 3],         // target not in the frame: nothing
    [T0, 'Aldenmar', 'Aldenmar', 3],       // self: nothing
  ]);
  it('grows with the cast, is whole at completion, then fades', () => {
    const a = heals.activeArcs(casts, T0 + 5000, find);
    expect(a.length).toBe(1);
    expect(a[0].p).toBeCloseTo(0.5, 5);
    expect(a[0].alpha).toBe(1);
    const done = heals.activeArcs(casts, T0 + 10_000 + 600, find)[0];
    expect(done.p).toBe(1);
    expect(done.alpha).toBeCloseTo(0.5, 2);
    expect(heals.activeArcs(casts, T0 + 10_000 + heals.HEAL_FADE_MS, find)).toEqual([]);
  });
  it('nothing before the cast starts', () => { expect(heals.activeArcs(casts, T0 - 1, find)).toEqual([]); });
  it('a ring of Complete Healings is one arc per healer onto the tank', () => {
    const ring = heals.parseHealCasts(['Aldenmar', 'Brackwyn', 'Rethlan', 'Nyssara'].map((n, i) => [T0 + i * 100, n, 'Corvale', 10]));
    const pos = { Aldenmar: { x: 1, y: 1, z: 0, zone: 'z' }, Brackwyn: { x: 2, y: 1, z: 0, zone: 'z' }, Rethlan: { x: 3, y: 1, z: 0, zone: 'z' }, Nyssara: { x: 4, y: 1, z: 0, zone: 'z' }, Corvale: { x: 0, y: 0, z: 0, zone: 'z' } };
    const arcs = heals.activeArcs(ring, T0 + 2000, n => pos[n[0].toUpperCase() + n.slice(1).toLowerCase()] ?? null);
    expect(arcs.length).toBe(4);
    expect(new Set(arcs.map(a => a.target))).toEqual(new Set(['Corvale']));
  });
  it('is bounded', () => {
    const many = heals.parseHealCasts(Array.from({ length: 200 }, (_, i) => [T0 + i, 'Aldenmar', 'Brackwyn', 5]));
    expect(heals.activeArcs(many, T0 + 1000, find).length).toBe(heals.MAX_ARCS);
  });
  it('finds a long cast that began a while ago, with later short ones before it in the list', () => {
    const list = heals.parseHealCasts([[T0, 'Aldenmar', 'Brackwyn', 10], ...Array.from({ length: 50 }, (_, i) => [T0 + 1000 + i * 100, 'Brackwyn', 'Aldenmar', 1])]);
    expect(heals.activeArcs(list, T0 + 9000, find).some(a => a.caster === 'Aldenmar')).toBe(true);
  });
});

describe('archPoint', () => {
  it('starts at the healer and ends at the target, bowed in between', () => {
    expect(heals.archPoint(0, 0, 100, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(heals.archPoint(0, 0, 100, 0, 1)).toEqual({ x: 100, y: 0 });
    const m = heals.archPoint(0, 0, 100, 0, 0.5);
    expect(m.x).toBeCloseTo(50, 5);
    expect(Math.abs(m.y)).toBeGreaterThan(5);
  });
});

describe('heal travel: the dot, its countdown, the landing pulse', () => {
  const T = 1_700_000_000_000;
  const place = { Aldenmar: { x: 0, y: 0, z: 0, zone: 'z' }, Brackwyn: { x: 100, y: 0, z: 0, zone: 'z' }, Corvale: { x: 50, y: 50, z: 0, zone: 'z' }, Rethlan: { x: 60, y: 40, z: 0, zone: 'z' } };
  const find = (n) => place[n] ?? null;
  const at = (casts, ms) => heals.activeArcs(heals.parseHealCasts(casts), T + ms, find);
  it('the dot starts at the healer and lands on the target: position is cast progress', () => {
    const [a] = at([[T, 'Aldenmar', 'Brackwyn', 10]], 0);
    expect(heals.archPoint(0, 0, 100, 0, a.p)).toEqual({ x: 0, y: 0 });
    const [m] = at([[T, 'Aldenmar', 'Brackwyn', 10]], 5000);
    expect(heals.archPoint(0, 0, 100, 0, m.p)).toEqual(heals.archPoint(0, 0, 100, 0, 0.5));
    const [e] = at([[T, 'Aldenmar', 'Brackwyn', 10]], 10_000);
    expect(heals.archPoint(0, 0, 100, 0, e.p)).toEqual({ x: 100, y: 0 });
  });
  it('left counts down to 0 at landing, since is negative until then', () => {
    const c = [[T, 'Aldenmar', 'Brackwyn', 10]];
    expect(at(c, 8600)[0].left).toBeCloseTo(1.4, 5);
    expect(at(c, 8600)[0].since).toBe(-1400);
    expect(at(c, 10_200)[0].left).toBe(0);
    expect(at(c, 10_200)[0].since).toBe(200);
  });
  it('the label is one decimal, and hidden in the last 0.1 s and after landing', () => {
    expect(heals.healLabel(1.4)).toBe('1.4');
    expect(heals.healLabel(10)).toBe('10.0');
    expect(heals.healLabel(0.1)).toBe('0.1');
    expect(heals.healLabel(0.099)).toBeNull();
    expect(heals.healLabel(0)).toBeNull();
  });
  it('the landing pulse runs 0.6 s from the landing, and not before or after', () => {
    expect(heals.landPulse(-1)).toBeNull();
    expect(heals.landPulse(0)).toBe(0);
    expect(heals.landPulse(300)).toBeCloseTo(0.5, 5);
    expect(heals.landPulse(heals.HEAL_LAND_MS)).toBeNull();
    expect(heals.HEAL_LAND_MS).toBe(600);
  });
  it('the pulse ends inside the arc\'s own fade, so it is never cut off', () => {
    expect(heals.HEAL_LAND_MS).toBeLessThanOrEqual(heals.HEAL_FADE_MS);
  });
  it('a chain onto one tank labels only the heal nearest to landing; another target keeps its own', () => {
    const chain = [[T, 'Aldenmar', 'Brackwyn', 10], [T + 2000, 'Corvale', 'Brackwyn', 10], [T + 4000, 'Rethlan', 'Brackwyn', 10], [T + 1000, 'Rethlan', 'Corvale', 10]];
    const arcs = at(chain, 6000);
    const lab = heals.labelledArcs(arcs);
    expect(lab.size).toBe(2);
    const onTank = [...lab].map(i => arcs[i]).find(a => a.target === 'Brackwyn');
    expect(onTank.caster).toBe('Aldenmar');
    expect(onTank.left).toBeCloseTo(4, 5);
  });
  it('a heal in its last tenth is not labelled, and the next one takes the label', () => {
    const arcs = at([[T, 'Aldenmar', 'Brackwyn', 10], [T + 2000, 'Corvale', 'Brackwyn', 10]], 9950);
    const lab = heals.labelledArcs(arcs);
    expect([...lab].map(i => arcs[i].caster)).toEqual(['Corvale']);
  });
  it('the rendering uses the shared rules, not its own', () => {
    const board = stripJs(readSource('web/app/spectator/replay/ReplayBoard.tsx'));
    const three = stripJs(readSource('web/app/spectator/replay/Replay3D.tsx'));
    for (const s of [board, three]) {
      expect(s).toMatch(/labelledArcs\(/);
      expect(s).toMatch(/landPulse\(/);
      expect(s).toMatch(/GUIDE_ALPHA/);
    }
  });
});

// ── Me ───────────────────────────────────────────────────────────────────────
describe('Me', () => {
  const roster = new Map([['aldenmar', 1], ['corvale', 1], ['brackwyn', 1]]);
  it('only the member\'s characters that are in the replay, in account order, deduped', () => {
    expect(heals.presentMine(['Corvale', 'Zarrin', 'Aldenmar', 'corvale'], roster)).toEqual(['Corvale', 'Aldenmar']);
    expect(heals.presentMine([], roster)).toEqual([]);
  });
  it('nextMe starts at the first and cycles', () => {
    const p = ['Corvale', 'Aldenmar'];
    expect(heals.nextMe(p, null)).toBe('Corvale');
    expect(heals.nextMe(p, 'Brackwyn')).toBe('Corvale');
    expect(heals.nextMe(p, 'corvale')).toBe('Aldenmar');
    expect(heals.nextMe(p, 'Aldenmar')).toBe('Corvale');
    expect(heals.nextMe([], 'x')).toBeNull();
  });
  it('one character: next is the followed one, which toggleFollow reads as letting go', async () => {
    const f = await import('../web/lib/replayFollow.ts');
    let pk = f.toggleFollow(f.NO_PICKS, heals.nextMe(['Corvale'], null));
    expect(pk.follow).toBe('Corvale');
    pk = f.toggleFollow(pk, heals.nextMe(['Corvale'], pk.follow));
    expect(pk.follow).toBeNull();
  });
  it('meSet lower-cases', () => { expect([...heals.meSet(['Corvale', 'ALDENMAR'])]).toEqual(['corvale', 'aldenmar']); });
});

// ── The loader ───────────────────────────────────────────────────────────────
function fakeDb(tables) {
  const log = [];
  const db = {
    from(table) {
      const q = { table, filters: [], orders: [] };
      log.push(q);
      const chain = {
        select() { return chain; },
        eq(c, v) { q.filters.push(['eq', c, v]); return chain; },
        gte(c, v) { q.filters.push(['gte', c, v]); return chain; },
        lt(c, v) { q.filters.push(['lt', c, v]); return chain; },
        gt(c, v) { q.filters.push(['gt', c, v]); return chain; },
        filter(c, op, v) { q.filters.push([op, c, v]); return chain; },
        order(c) { q.orders.push(c); return chain; },
        range(a, b) { q.range = [a, b]; return chain; },
        then(res, rej) { return Promise.resolve({ data: (tables[table] ?? []).slice(q.range?.[0] ?? 0, (q.range?.[1] ?? 999) + 1), error: null }).then(res, rej); },
      };
      return chain;
    },
  };
  return { db, log };
}

describe('loader', () => {
  const FROM = T0, TO = T0 + 15 * 60_000;
  it('raid_casts is read windowed >= from and < to, heals only, four columns, paged and ordered', async () => {
    const { db, log } = fakeDb({ raid_casts: [row({ id: 1 }), row({ id: 2, at: 4000 })] });
    const w = await loadHealCasts(db, 'wolfpack', new Date(FROM).toISOString(), new Date(TO).toISOString());
    const q = log.find(x => x.table === 'raid_casts');
    expect(q.filters).toContainEqual(['gte', 'cast_at', new Date(FROM).toISOString()]);
    expect(q.filters).toContainEqual(['lt', 'cast_at', new Date(TO).toISOString()]);
    expect(q.filters).toContainEqual(['gt', 'heal_amount', 0]);
    expect(q.filters).toContainEqual(['eq', 'guild_id', 'wolfpack']);
    expect(q.orders).toEqual(['cast_at', 'id']);
    expect(q.range).toBeTruthy();
    expect(w.length).toBe(2);
  });
  it('the MA read is the raid channel, from the hold before the window to its end, and sends names only', async () => {
    const lines = [
      { id: 1, ts: new Date(FROM - 3600_000).toISOString(), speaker: 'Aldenmar', text: 'MA is Brackwyn' },
      { id: 2, ts: new Date(FROM + 1000).toISOString(), speaker: 'Aldenmar', text: 'we need an assist here' },
      { id: 3, ts: new Date(FROM + 2000).toISOString(), speaker: 'Corvale', text: 'assist me on a gnoll' },
    ];
    const { db, log } = fakeDb({ chat_messages: lines });
    const out = await loadMaDeclarations(db, 'wolfpack', FROM, new Date(TO).toISOString(), new Set(['brackwyn', 'corvale']));
    const q = log.find(x => x.table === 'chat_messages');
    expect(q.filters).toContainEqual(['eq', 'channel', 'raid']);
    expect(q.filters).toContainEqual(['gte', 'ts', new Date(FROM - ma.DECL_TTL_MS).toISOString()]);
    expect(q.filters).toContainEqual(['lt', 'ts', new Date(TO).toISOString()]);
    expect(out).toEqual([[FROM - 3600_000, 'Brackwyn'], [FROM + 2000, 'Corvale']]);
  });
  it('extras keep only what the window can place, and a failed read is none, not a failed window', async () => {
    const { db } = fakeDb({
      raid_casts: [row({ id: 1 }), row({ id: 2, target: 'Stranger' })],
      chat_messages: [{ id: 1, ts: new Date(FROM).toISOString(), speaker: 'Aldenmar', text: 'MA is Brackwyn' }],
    });
    const ex = await loadReplayExtras(db, 'wolfpack', FROM, TO, new Set(['aldenmar', 'brackwyn']));
    expect(ex.casts.length).toBe(1);
    expect(ex.ma).toEqual([[FROM, 'Brackwyn']]);
    const broken = { from() { throw new Error('down'); } };
    expect(await loadReplayExtras(broken, 'wolfpack', FROM, TO, new Set())).toEqual({ casts: [], ma: [] });
  });
});

// ── The routes ───────────────────────────────────────────────────────────────
describe('routes serve the extras with the frames', () => {
  const spectator = stripJs(readSource('web/app/api/spectator/replay/route.ts'));
  const session = stripJs(readSource('web/app/api/raid/session/replay/route.ts'));
  const share = stripJs(readSource('web/app/api/share/raid/[token]/replay/route.ts'));
  it('the members\' routes call the loader, and honour lean', () => {
    for (const s of [spectator, session]) {
      expect(s).toMatch(/loadReplayExtras\(/);
      expect(s).toMatch(/'lean'\)\s*===\s*'1'/);
    }
  });
  it('the session route renames opted-out names in casts and the assist, like the dots', () => {
    expect(session).toMatch(/anonName\(anon, c\[1\]\)/);
    expect(session).toMatch(/anonName\(anon, c\[2\]\)/);
    expect(session).toMatch(/anonName\(anon, m\[1\]\)/);
  });
  it('the public share route serves none of it', () => {
    expect(share).not.toMatch(/loadReplayExtras|raid_casts|chat_messages/);
  });
});
