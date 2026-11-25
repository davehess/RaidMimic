// test/map-radar.test.js — the radar sense while blind, the target's size and reach, and the test blind.
//
// The guild lead, 2026-11-25: "let's try to implement that then [radar sense, Decision Desk pick A], and show where the mob is
// with the target info, how large it is and its attack range. I will need a button to test blind mode on beta for this without
// being blinded, maybe with split screen to try to see what it looks like between the modes for testing".
//
//  1. map.html's radar maths (radarCam / radarPt / radarSeg, pure helpers, run as written): a point ahead lands in the middle,
//     east of a north-facing you lands right, behind you is not drawn, a wall you stand beside is clipped, not dropped; the
//     camera turns with your heading.
//  2. targetReach: the reach the bot sends, with the same guards as the rampage rings.
//  3. the agent: POST /api/blind-test sets a 'test' blind on the active character, ends only a test blind, never overrides a
//     real one; the map feed says it is a test and how long is left; the Map's target carries `reach`.
//  4. map.html wiring: ⚙ → Blind view (Map + radar by default), the split / radar layouts, the test button, the 2D reach ring.
//
// Mutation-checked (by hand, 2026-11-25): drop the near-plane clip in radarSeg and "a wall beside you is clipped" fails; build
// the camera without the heading and "the camera turns with your heading" fails; let a test blind override a real one and
// "never takes over a real blind" fails; let `on: false` end a real blind and "ends only a test blind" fails.
//
// Run: npx vitest run test/map-radar.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, stripJs, ROOT, AGENT_INDEX } from './_source-slice.js';

const MAP_RAW = readSource(path.join(ROOT, 'apps', 'mimic', 'map.html'));
const MAP = stripJs(MAP_RAW);
const AGENT_RAW = readSource(AGENT_INDEX);
const AGENT = stripJs(AGENT_RAW);
const BOT = stripJs(readSource(path.join(ROOT, 'index.js')));

const helpers = sliceBlock(MAP_RAW, '// ── pure helpers', '// ── end pure helpers ──');
const H = new Function(helpers + '\nreturn { radarCam, radarPt, radarSeg, radarCamSpace, targetReach, toScreen, RADAR_BACK, RADAR_NEAR };')();

const W = 400, HH = 300;
const ME = { x: 0, y: 0, z: 0 };   // server frame; north is +y, west is +x

describe('radar maths', () => {
  it('facing north: a point ahead lands in the middle, one to the east lands right of it', () => {
    const c = H.radarCam(ME, 0);
    const ahead = H.toScreen(0, 50), east = H.toScreen(-20, 50);   // server +x is west, so east is -x
    const pa = H.radarPt(c, ahead.sx, ahead.sy, 0, W, HH), pe = H.radarPt(c, east.sx, east.sy, 0, W, HH);
    expect(pa[0]).toBeCloseTo(W / 2, 5);
    expect(pe[0]).toBeGreaterThan(W / 2);
  });
  it('higher is higher on screen, and a point behind the camera is not drawn', () => {
    const c = H.radarCam(ME, 0), a = H.toScreen(0, 50);
    expect(H.radarPt(c, a.sx, a.sy, 20, W, HH)[1]).toBeLessThan(H.radarPt(c, a.sx, a.sy, 0, W, HH)[1]);
    const behind = H.toScreen(0, -(H.RADAR_BACK + 10));
    expect(H.radarPt(c, behind.sx, behind.sy, 0, W, HH)).toBeNull();
  });
  it('the camera turns with your heading: facing east, a point to the east lands in the middle', () => {
    const c = H.radarCam(ME, 384);   // a quarter turn from north, whichever way the client counts: test both ends
    const c2 = H.radarCam(ME, 128);
    const east = H.toScreen(-50, 0);
    const xs = [H.radarPt(c, east.sx, east.sy, 0, W, HH), H.radarPt(c2, east.sx, east.sy, 0, W, HH)].filter(Boolean).map(p => p[0]);
    expect(xs.some(x => Math.abs(x - W / 2) < 1)).toBe(true);
    const north = H.radarCam(ME, 0);
    expect(c.fx).not.toBeCloseTo(north.fx, 3);
  });
  it('a wall you stand beside is clipped at the near plane, not dropped; one wholly behind is dropped', () => {
    const c = H.radarCam(ME, 0);
    const a = H.toScreen(10, -(H.RADAR_BACK + 20)), b = H.toScreen(10, 40);   // from behind the camera to ahead of you
    const s = H.radarSeg(c, [a.sx, a.sy, 0], [b.sx, b.sy, 0], W, HH);
    expect(s).not.toBeNull();
    expect(Math.min(s[0][2], s[1][2])).toBeCloseTo(H.RADAR_NEAR, 5);
    const d = H.toScreen(10, -(H.RADAR_BACK + 30)), e = H.toScreen(-10, -(H.RADAR_BACK + 30));
    expect(H.radarSeg(c, [d.sx, d.sy, 0], [e.sx, e.sy, 0], W, HH)).toBeNull();
  });
  it('no heading: it faces north', () => {
    expect(H.radarCam(ME, null)).toMatchObject({ fx: 0, fy: -1 });
  });
});

describe('targetReach', () => {
  const t = { name: 'a lava elemental', type: 1, hp_pct: 63, reach: { radius: 14.4, melee: 16.55, melee_moving: 14.55 } };
  it('size and where it hits, with a label', () => {
    expect(H.targetReach(t)).toEqual({ radius: 14.4, melee: 16.55, label: 'size 14.4 · hits at 16.6' });
  });
  it('nothing for a player, a corpse, a dead mob, no reach or nonsense', () => {
    expect(H.targetReach({ ...t, type: 0 })).toBeNull();
    expect(H.targetReach({ ...t, name: "a lava elemental's corpse" })).toBeNull();
    expect(H.targetReach({ ...t, hp_pct: 0 })).toBeNull();
    expect(H.targetReach({ ...t, reach: null })).toBeNull();
    expect(H.targetReach({ ...t, reach: { radius: -1, melee: 16 } })).toBeNull();
  });
});

describe('agent: the test blind', () => {
  const block = sliceBlock(AGENT_RAW, 'function _blindTestSet(b, now) {', '\n}\n');
  const boot = (state = {}, ch = 'Aldenmar') => {
    const f = new Function('_mapActiveCharacter', '_blindState', '_zealTargetForChar', block + '\nreturn _blindTestSet;');
    return { set: f(() => ch, state, () => 'a lava elemental'), state };
  };
  it('blinds the active character for 30 s by default, as a test', () => {
    const { set, state } = boot();
    expect(set({ on: true }, 1000)).toMatchObject({ ok: true, character: 'Aldenmar', active: true, until: 31000 });
    expect(state.aldenmar).toMatchObject({ active: true, source: 'test', expiresAt: 31000, target: 'a lava elemental' });
  });
  it('5 to 120 seconds', () => {
    const { set, state } = boot();
    set({ on: true, secs: 1 }, 0); expect(state.aldenmar.expiresAt).toBe(5000);
    set({ on: true, secs: 999 }, 0); expect(state.aldenmar.expiresAt).toBe(120000);
  });
  it('ends only a test blind', () => {
    const { set, state } = boot();
    set({ on: true }, 0);
    expect(set({ on: false }, 500)).toMatchObject({ ok: true, active: false });
    const real = boot({ aldenmar: { active: true, source: 'npc_blind', expiresAt: 30000 } });
    real.set({ on: false }, 500);
    expect(real.state.aldenmar.active).toBe(true);
  });
  it('never takes over a real blind', () => {
    const real = boot({ aldenmar: { active: true, source: 'pitted_iron_ring', expiresAt: 24000 } });
    expect(real.set({ on: true }, 0)).toMatchObject({ ok: false, error: 'already blind for real' });
    expect(real.state.aldenmar.source).toBe('pitted_iron_ring');
  });
  it('no character in game: says so', () => {
    expect(boot({}, null).set({ on: true }, 0)).toEqual({ ok: false, error: 'no character in game' });
  });
  it('is routed, checks the origin, and the map feed says it is a test with the seconds left', () => {
    expect(AGENT).toMatch(/if \(req\.url === '\/api\/blind-test' && req\.method === 'POST'\) return _handleBlindTest\(req, res\);/);
    expect(AGENT).toMatch(/async function _handleBlindTest\(req, res\) \{[\s\S]{0,200}if \(!_localOriginOk\(req\)\) return send\(403/);
    expect(AGENT).toMatch(/if \(out\.blind && b\.source === 'test'\) out\.blind_test = Math\.max\(0, Math\.round\(\(b\.expiresAt - now\) \/ 1000\)\);/);
  });
  it('the Map\'s target carries the bot\'s reach', () => {
    expect(AGENT).toMatch(/reach: rc && Number\(rc\.radius\) > 0 && Number\(rc\.melee\) > 0 \? rc : null,/);
    expect(AGENT).toMatch(/if \(reach\.reach\) out\.target\.reach = reach\.reach;/);
  });
});

describe('bot: mob info carries reach', () => {
  it('for every mob with a size, not only rampagers', () => {
    expect(BOT).toMatch(/const reach = mobSpecials\.reachInfo\(r\);/);
    expect(BOT).toMatch(/\.\.\.\(reach \? \{ reach \} : \{\}\),/);
  });
});

describe('map.html wiring', () => {
  it('⚙ → Blind view: Map + radar (the default), Radar, Map; remembered', () => {
    expect(MAP).toMatch(/<select id="cfgBlindView"><option value="split">Map \+ radar<\/option><option value="radar">Radar<\/option><option value="map">Map<\/option><\/select>/);
    expect(MAP).toMatch(/S\.blindView = \(function \(\) \{ var v = lsGet\('wp-map-blind-view'\); return v === 'map' \|\| v === 'radar' \? v : 'split'; \}\)\(\);/);
  });
  it('the layouts: split halves the Map, radar covers it, only while blind', () => {
    expect(MAP).toMatch(/#mapPane\.blind-split #stage\{right:50%\}/);
    expect(MAP).toMatch(/#mapPane\.blind-radar #radar\{width:100%/);
    const sync = sliceBlock(MAP, 'function syncBlindView() {', 'resize();');
    expect(sync).toMatch(/var v = S\.blind \? S\.blindView : 'map';/);
  });
  it('the test button posts to the agent and the radar runs after every Map paint', () => {
    expect(MAP).toMatch(/fetch\('http:\/\/127\.0\.0\.1:' \+ PORT \+ '\/api\/blind-test', \{ method: 'POST'/);
    expect(MAP).toMatch(/S\.blindTest = p\.blind && p\.blind_test != null \? p\.blind_test : null;/);
    expect(MAP).toMatch(/renderMapInner\(animating\);\s*paintHoles\(\);\s*renderRadar\(Date\.now\(\)\);/);
  });
  it('the 2D Map draws the target\'s body and a dashed ring at its reach', () => {
    const block = sliceBlock(MAP, 'var rch = targetReach(P.target);', 'ctx.restore();');
    expect(block).toMatch(/ctx\.arc\(tq\[0\], tq\[1\], rch\.radius \* v\.scale/);
    expect(block).toMatch(/ctx\.setLineDash\(\[4, 3\]\); ctx\.arc\(tq\[0\], tq\[1\], rch\.melee \* v\.scale/);
  });
});
