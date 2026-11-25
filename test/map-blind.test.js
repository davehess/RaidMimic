// test/map-blind.test.js — Blind Mode opens the Map and zooms it in on the nearest walls.
//
// The guild lead, 2026-11-25: "build the map into blind mode zoomed in enough to see where the closest walls are near or directly
// above/below the player".
//
// Three halves:
//  1. main.js: the Map is one of the blind-forced overlays, in both Window and Full mode, and blind's start/end apply it.
//  2. the agent: /api/map-state carries `blind` from the same per-character state the HUD reads.
//  3. map.html's blind block, run as shipped against a stub page: Follow me, the Engaged list out, ±25 walls bright, the zoom
//     set from the nearest wall on YOUR floor (a line 100 above does not count), the wheel stopping it, and everything put back.
//
// Mutation-checked (by hand, 2026-11-25): drop the z test in blindNearestWall and "a wall on another floor does not set the
// zoom" fails; leave S.view.scale where blind put it instead of restoring S.userScale and "blind ending puts your zoom, Follow
// and the list back" fails.
//
// Run: npx vitest run test/map-blind.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, stripJs, ROOT, AGENT_INDEX } from './_source-slice.js';

const MAIN = stripJs(readSource(path.join(ROOT, 'apps', 'mimic', 'main.js')));
const AGENT = stripJs(readSource(AGENT_INDEX));
const MAP_HTML = readSource(path.join(ROOT, 'apps', 'mimic', 'map.html'));

describe('main.js: the Map opens for the blind', () => {
  it('is a blind-forced overlay', () => {
    expect(MAIN).toMatch(/const _BLIND_FORCED_KEYS = \[[^\]]*'map'/);
  });
  it('shows in Window and Full mode while blind', () => {
    const apply = sliceBlock(MAIN, 'function applyMapVisibility()', 'mapWindow.hide();');
    expect(apply).toMatch(/shouldShow = _blindForceOpen\('map'\) \|\|/);
    const wanted = sliceBlock(MAIN, "if (e.key === 'map' && _mapFull) {", '}');
    expect(wanted).toMatch(/return _blindForceOpen\('map'\) \|\|/);
  });
  it('blind starting builds and applies it, blind ending applies it again', () => {
    const poll = sliceBlock(MAIN, 'function _pollBlindState()', 'function _onActiveCharacter');
    const enter = poll.slice(poll.indexOf('if (nowOn && !_blindActive)'), poll.indexOf('else if (!nowOn && _blindActive)'));
    const leave = poll.slice(poll.indexOf('else if (!nowOn && _blindActive)'));
    expect(enter).toMatch(/if \(!mapWindow\)\s+createMapOverlay\(\);/);
    expect(enter).toMatch(/applyMapVisibility\(\);/);
    expect(leave).toMatch(/applyMapVisibility\(\);/);
  });
});

describe('agent: the map feed says blind', () => {
  it('reads the per-character blind state', () => {
    const pay = sliceBlock(AGENT, 'function _mapStatePayload(', 'const zd = _mapZoneDoc(zone);');
    expect(pay).toMatch(/_blindState\[String\(character \|\| ''\)\.toLowerCase\(\)\]; out\.blind = !!\(b && b\.active\)/);
  });
});

// The blind block, booted against a stub page. Walls are in the SCREEN frame (toScreen = -x, -y), as prepLocal stores them.
const BLOCK = sliceBlock(MAP_HTML, '  function levelRange()', '    S.view.scale = ns; b.set = true;\n  }');
function boot({ walls = [], sideOpen = false, popped = false } = {}) {
  const calls = { slot: 0, follow: 0, side: 0 };
  const S = {
    view: { cx: 0, cy: 0, scale: 0.5 }, userScale: 0.5, follow: false, followWho: 'target', levels: 2,
    sideOpen, popped, w: 400, h: 400,
    p: { self: { x: 0, y: 0, z: 0 } },
    local: { groups: [{ xy: Float32Array.from(walls.flatMap(w => w.xy)), z: Float32Array.from(walls.map(w => w.z)) }] },
  };
  const f = new Function('S', 'PART_TIMERS', 'LEVEL_STEPS', 'syncFollowBtn', 'syncSide', 'slotOpen', 'slotChanged', 'localWalls',
    'toScreen', 'drawn', 'selfZ',
    BLOCK + '\nreturn { levelRange, noteBlind, blindNearestWall, blindZoom, BLIND_LEVEL };');
  const api = f(S, false, [25, 50, 100, 150, 200, 300, 400, 0],
    () => { calls.follow++; }, () => { calls.side++; }, () => S.sideOpen, () => { calls.slot++; },
    () => walls.length > 0, (x, y) => ({ sx: -x, sy: -y }), (k, m) => m, () => 0);
  return { S, api, calls };
}
// A wall line 10 units away on the screen frame's x axis, at height z.
const wallAt = (dist, z) => ({ xy: [dist, -50, dist, 50], z });

describe('map.html: blind', () => {
  it('follows you, slides the Engaged list out and draws your floor (±25) bright', () => {
    const { S, api, calls } = boot();
    expect(api.levelRange()).toBe(100);
    api.noteBlind(true);
    expect(S.follow).toBe(true);
    expect(S.followWho).toBe('me');
    expect(S.sideOpen).toBe(true);
    expect(calls.slot).toBe(1);
    expect(api.levelRange()).toBe(api.BLIND_LEVEL);
  });
  it('zooms so the nearest wall on your floor is in view (radius 3x its distance)', () => {
    const { S, api } = boot({ walls: [wallAt(30, 5)] });
    api.noteBlind(true);
    api.blindZoom(1000);
    expect(S.view.scale).toBeCloseTo(400 / (2 * 90));
  });
  it('never closer than a 60-unit radius (the room and its raiders, not one wall)', () => {
    const { S, api } = boot({ walls: [wallAt(4, 0)] });
    api.noteBlind(true);
    api.blindZoom(1000);
    expect(S.view.scale).toBeCloseTo(400 / (2 * 60));
  });
  it('never further than a 250-unit radius', () => {
    const { S, api } = boot({ walls: [wallAt(200, 0)] });
    api.noteBlind(true);
    api.blindZoom(1000);
    expect(S.view.scale).toBeCloseTo(400 / (2 * 250));
  });
  it('a wall on another floor does not set the zoom', () => {
    const { S, api } = boot({ walls: [wallAt(3, 100), wallAt(40, 0)] });
    api.noteBlind(true);
    expect(api.blindNearestWall({ x: 0, y: 0, z: 0 })).toBeCloseTo(40);
    api.blindZoom(1000);
    expect(S.view.scale).toBeCloseTo(400 / (2 * 120));
  });
  it('no walls known: a 100-unit radius', () => {
    const { S, api } = boot();
    api.noteBlind(true);
    api.blindZoom(1000);
    expect(S.view.scale).toBeCloseTo(2);
  });
  it('holds still unless the right zoom moves by 15%, and checks at most every half second', () => {
    const { S, api } = boot({ walls: [wallAt(30, 0)] });
    api.noteBlind(true);
    api.blindZoom(1000);
    const first = S.view.scale;
    S.local.groups[0].xy.set([32, -50, 32, 50]);   // 7% further: no change
    api.blindZoom(2000);
    expect(S.view.scale).toBe(first);
    S.local.groups[0].xy.set([60, -50, 60, 50]);   // 2x further, but only 0.2 s later: no check yet
    api.blindZoom(2200);
    expect(S.view.scale).toBe(first);
    api.blindZoom(2600);
    expect(S.view.scale).toBeCloseTo(400 / (2 * 180));
  });
  it('the wheel stops the auto zoom', () => {
    const zoomBy = sliceBlock(MAP_HTML, 'function zoomBy(deltaY, mx, my) {', 'renderMap();');
    expect(stripJs(zoomBy)).toMatch(/if \(S\.blind\) S\.blind\.auto = false;/);
    const { S, api } = boot({ walls: [wallAt(10, 0)] });
    api.noteBlind(true);
    S.blind.auto = false;
    api.blindZoom(1000);
    expect(S.view.scale).toBe(0.5);
  });
  it('blind ending puts your zoom, Follow and the list back as they were', () => {
    const { S, api, calls } = boot({ walls: [wallAt(10, 0)] });
    api.noteBlind(true);
    api.blindZoom(1000);
    api.noteBlind(false);
    expect(S.view.scale).toBe(0.5);
    expect(S.follow).toBe(false);
    expect(S.followWho).toBe('target');
    expect(S.sideOpen).toBe(false);
    expect(calls.slot).toBe(2);
    expect(api.levelRange()).toBe(100);
  });
  it('a list already out, or popped into its own window, is left alone', () => {
    for (const o of [{ sideOpen: true }, { popped: true }]) {
      const { S, api, calls } = boot(o);
      api.noteBlind(true);
      api.noteBlind(false);
      expect(calls.slot).toBe(0);
      expect(S.sideOpen).toBe(!!o.sideOpen);
    }
  });
  it('the page hooks it up: the payload, and the zoom before Follow places the view', () => {
    const src = stripJs(MAP_HTML);
    expect(src).toMatch(/noteBlind\(!!p\.blind\);/);
    expect(src).toMatch(/blindZoom\(rt\);[\s\S]{0,200}if \(S\.follow && S\.p && !S\.drag\) followTo\(followSubject\(rt\)\);/);
  });
});
