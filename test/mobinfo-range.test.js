// test/mobinfo-range.test.js — Target Info: live distance, aggro + assist radius, Area Rampage reach and its red.
//
// The guild lead, 2026-11-15: "add target distance and aggro and social radius to target info, and area ramp distance
// next to the area ramp bullet. make area ramp red highlighted when in area ramp range".
//
// Server facts the pure functions copy (SecretsOTheP/EQMacEmu @ c2cd2651):
//   zone/aggro.cpp:453        aggro test is DistanceSquared on vec4 -> vec3: 3D, not flat
//   zone/zonedb.cpp:2025-2034 aggroradius <= 0 -> 70; assistradius <= 0 -> the aggro radius
//   zone/hate_list.cpp:1851   AE rampage measures Distance() in 3D
//
// Mutation-checked (by hand, 2026-11-15; see the report): drop the z term in rangeDist -> "3D" fails; change the 70 ->
// "defaults" fails; make aeHot `<` instead of `<=` -> "edge" fails; drop the null guard in aeHot -> "unknowns" fails;
// remove `paintRange(mi)` from the unchanged-html branch -> "paints on an unchanged body" fails.
//
// Run: npx vitest run test/mobinfo-range.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, AGENT_INDEX, sliceBlock, evalBlock, stripJs } from './_source-slice.js';

const html = fs.readFileSync(path.join(ROOT, 'apps', 'mimic', 'mobinfo.html'), 'utf8');
const code = stripJs(html);
const esc = sliceBlock(html, '  function esc(s){', '\n');
const chipBits = sliceBlock(html, '  var WARN_SPECS = {', "esc(s ? s[0] : label)+'</span>';\n  }\n")
  .replace(/function isReverseSlow[\s\S]*?\n  }\n/, '');
const range = sliceBlock(html, '  var AGGRO_DEFAULT = 70;', '  // ── end range block');
const { rangeDist, mobRadii, aeRange, aeHot, aeChip, rangeRow, rangeZone } = evalBlock(
  esc + chipBits + range, ['rangeDist', 'mobRadii', 'aeRange', 'aeHot', 'aeChip', 'rangeRow', 'rangeZone']);

const agent = fs.readFileSync(AGENT_INDEX, 'utf8');
const mapXY = sliceBlock(agent, 'function _mapServerXY(loc) {', '\n}\n');
const posFn = sliceBlock(agent, 'function _mobInfoPos(st) {', '\n}\n');
const { _mobInfoPos } = evalBlock(mapXY + posFn, ['_mobInfoPos']);

const P = (x, y, z) => ({ x, y, z });

describe('rangeDist (the server measures in 3D)', () => {
  it('is the 3D distance, so a height difference counts', () => {
    expect(rangeDist({ self: P(0, 0, 0), target: P(3, 4, 0) })).toBe(5);
    expect(rangeDist({ self: P(0, 0, 0), target: P(0, 0, 12) })).toBe(12);
    expect(rangeDist({ self: P(1, 2, 3), target: P(4, 6, 15) })).toBeCloseTo(Math.sqrt(9 + 16 + 144), 9);
  });
  it('is symmetric and zero on the same spot', () => {
    expect(rangeDist({ self: P(5, 5, 5), target: P(5, 5, 5) })).toBe(0);
    expect(rangeDist({ self: P(-3, 7, 1), target: P(2, -5, 0) })).toBe(rangeDist({ self: P(2, -5, 0), target: P(-3, 7, 1) }));
  });
  it('is unknown (null) when either end or any axis is missing', () => {
    for (const pos of [null, undefined, {}, { self: P(0, 0, 0) }, { target: P(0, 0, 0) },
      { self: P(0, 0, null), target: P(1, 1, 1) }, { self: P(0, 0, 0), target: P(1, undefined, 1) },
      { self: P(0, 0, 0), target: P('x', 1, 1) }]) {
      expect(rangeDist(pos)).toBeNull();
    }
  });
});

describe('mobRadii (the server fills a blank radius in when it loads the NPC)', () => {
  it('uses the catalog values as they are', () => {
    expect(mobRadii({ aggroradius: 60, assistradius: 45 })).toEqual({ aggro: 60, assist: 45 });
  });
  it('defaults: aggro 0 is 70, assist 0 is the aggro radius', () => {
    expect(mobRadii({ aggroradius: 0, assistradius: 0 })).toEqual({ aggro: 70, assist: 70 });
    expect(mobRadii({ aggroradius: 55, assistradius: 0 })).toEqual({ aggro: 55, assist: 55 });
    expect(mobRadii({ aggroradius: -1, assistradius: 30 })).toEqual({ aggro: 70, assist: 30 });
  });
  it('an older bot (no key) or no mob is unknown, never 70', () => {
    for (const m of [{}, { aggroradius: null }, null, undefined, { aggroradius: 'x' }]) expect(mobRadii(m)).toBeNull();
  });
  it('aggro known but assist missing leaves assist unknown', () => {
    expect(mobRadii({ aggroradius: 60 })).toEqual({ aggro: 60, assist: null });
  });
});

describe('aeRange / aeHot / the chip', () => {
  it('reads the still reach off ae_rampage, one decimal', () => {
    expect(aeRange({ ae_rampage: { radius_still: 16.55 } })).toBe(16.6);
    expect(aeRange({ ae_rampage: { radius_still: 75 } })).toBe(75);
    for (const m of [{}, null, { ae_rampage: null }, { ae_rampage: { radius_still: 0 } }, { ae_rampage: {} }]) expect(aeRange(m)).toBeNull();
  });
  it('edge: inside and exactly on the reach is hot, past it is not', () => {
    expect(aeHot(74.9, 75)).toBe(true);
    expect(aeHot(75, 75)).toBe(true);
    expect(aeHot(75.1, 75)).toBe(false);
  });
  it('unknowns never highlight', () => {
    for (const [d, r] of [[null, 75], [10, null], [null, null], [undefined, 75], [NaN, 75], [10, NaN], [10, 0], [10, -5]]) {
      expect(aeHot(d, r)).toBe(false);
    }
  });
  it('the chip carries the reach in its text and for the painter; no reach is the plain chip', () => {
    const h = aeChip({ ae_rampage: { radius_still: 75 } });
    expect(h).toContain('>Area Rampage · 75<');
    expect(h).toContain('data-wp-ae="75"');
    expect(h).toContain('chip warn');
    const plain = aeChip({});
    expect(plain).toContain('>Area Rampage<');
    expect(plain).not.toContain('data-wp-ae');
  });
  it('the chip string has no state in it (hot is painted, not rendered)', () => {
    expect(aeChip({ ae_rampage: { radius_still: 16.55 } })).not.toMatch(/\bhot\b/);
  });
});

describe('rangeRow', () => {
  it('holds the distance placeholder hidden, then the radii', () => {
    const h = rangeRow({ aggroradius: 60, assistradius: 0 });
    expect(h).toContain('id="wpDistWrap" hidden');
    expect(h).toContain('id="wpDist"');
    expect(h).toContain('Aggro <b>60</b>');
    expect(h).toContain('Assist <b>60</b>');
  });
  it('is byte-stable: the live distance is never in it', () => {
    const m = { aggroradius: 60, assistradius: 45 };
    expect(rangeRow(m)).toBe(rangeRow(m));
    expect(rangeRow(m)).not.toMatch(/\d{3,}/);
  });
  it('an unknown radius draws nothing for it (distance placeholder only)', () => {
    const h = rangeRow({});
    expect(h).not.toContain('Aggro');
    expect(h).not.toContain('Assist');
    expect(rangeRow(null)).toContain('wpDistWrap');
  });
});

// The guild lead, 2026-11-16 (Decision Desk pick A, "Bigger, coloured line", follow-up "Yes"): the distance number is
// green clear of the assist radius, orange inside it, red inside the aggro radius.
describe('rangeZone (the distance colour)', () => {
  it('outside both radii is clear (green)', () => {
    expect(rangeZone(120, 60, 80)).toBe('clear');
  });
  it('inside the assist radius only is assist (orange)', () => {
    expect(rangeZone(70, 60, 80)).toBe('assist');
  });
  it('inside the aggro radius is aggro (red), even when assist is wider', () => {
    expect(rangeZone(40, 60, 80)).toBe('aggro');
    expect(rangeZone(40, 60, 60)).toBe('aggro');
  });
  it('the edges are inclusive', () => {
    expect(rangeZone(60, 60, 80)).toBe('aggro');
    expect(rangeZone(80, 60, 80)).toBe('assist');
    expect(rangeZone(80.1, 60, 80)).toBe('clear');
  });
  it('an unknown radius is not compared against', () => {
    expect(rangeZone(70, 60, null)).toBe('clear');
    expect(rangeZone(40, 60, null)).toBe('aggro');
    expect(rangeZone(70, null, 80)).toBe('assist');
    expect(rangeZone(90, null, 80)).toBe('clear');
  });
  it('no colour when neither radius is known, or the distance is', () => {
    expect(rangeZone(10, null, null)).toBe('');
    expect(rangeZone(10, undefined, undefined)).toBe('');
    expect(rangeZone(10, NaN, 0)).toBe('');
    expect(rangeZone(null, 60, 80)).toBe('');
    expect(rangeZone(NaN, 60, 80)).toBe('');
  });
});

describe('range row colour wiring', () => {
  it('the radii ride on the distance number as data-*, fixed per target (byte-stable)', () => {
    const h = rangeRow({ aggroradius: 60, assistradius: 45 });
    expect(h).toContain('id="wpDist" data-wp-aggro="60" data-wp-assist="45"');
    expect(rangeRow({ aggroradius: 60 })).not.toContain('data-wp-assist');
    expect(rangeRow({})).not.toContain('data-wp-aggro');
  });
  it('is no longer the small grey .sub line, and each band has a colour from the theme tokens', () => {
    expect(rangeRow({ aggroradius: 60 })).not.toMatch(/class="sub/);
    expect(code).toMatch(/\.rng b\.rd-clear\{color:var\(--wp-green\)\}/);
    expect(code).toMatch(/\.rng b\.rd-assist\{color:var\(--wp-orange\)\}/);
    expect(code).toMatch(/\.rng b\.rd-aggro\{color:var\(--wp-red\)\}/);
  });
  it('paintRange sets the class from rangeZone', () => {
    expect(code).toMatch(/rangeZone\(d, ag == null \? null : Number\(ag\), as == null \? null : Number\(as\)\)/);
    expect(code).toMatch(/num\.className = cls;/);
  });
});

describe('agent _mobInfoPos', () => {
  const st = (o) => Object.assign({ target_name: 'a mob', loc: { x: 1, y: 2, z: 3 }, target_loc: { x: 4, y: 6, z: 3 } }, o);
  it('gives both ends in the server axes (Zeal x/y swap)', () => {
    expect(_mobInfoPos(st())).toEqual({ self: { x: 2, y: 1, z: 3 }, target: { x: 6, y: 4, z: 3 } });
  });
  it('is null with no target, no target_loc, no self loc, no z, or an all-zero position', () => {
    expect(_mobInfoPos(st({ target_name: null }))).toBeNull();
    expect(_mobInfoPos(st({ target_loc: null }))).toBeNull();
    expect(_mobInfoPos(st({ loc: undefined }))).toBeNull();
    expect(_mobInfoPos(st({ target_loc: { x: 4, y: 6 } }))).toBeNull();
    expect(_mobInfoPos(st({ target_loc: { x: 4, y: 6, z: null } }))).toBeNull();
    expect(_mobInfoPos(st({ target_loc: { x: 0, y: 0, z: 0 } }))).toBeNull();
    expect(_mobInfoPos(null)).toBeNull();
  });
  it('rides the mobInfo payload', () => {
    expect(stripJs(agent)).toMatch(/target_pos:\s*_mobInfoPos\(st\),/);
  });
});

describe('mobinfo.html wiring (comments stripped)', () => {
  it('the Stats chip row swaps the Area Rampage chip for the ranged one', () => {
    expect(code).toMatch(/lab === 'Area Rampage' \? aeChip\(mob\) : specChip\(lab\)/);
  });
  it('the row sits between the resists and the chips, for a mob or a player target', () => {
    expect(code).toMatch(/tabBody = res \+ \(mob \|\| pl \? rangeRow\(mob\) : ''\) \+ spec \+ loadingNote;/);
  });
  it('paints on an unchanged body too, and after a rewrite', () => {
    expect(code).toMatch(/html === bodyEl\.__wpHtml\) \{ paintRange\(mi\); return; \}/);
    expect(code).toMatch(/bodyEl\.__wpHtml = html;\s*paintRange\(mi\);/);
  });
  it('the red is a class toggle on the live chip, from the theme red', () => {
    expect(code).toMatch(/classList\.toggle\('hot', hot\)/);
    expect(code).toMatch(/\.spec \.chip\.warn\.hot\{background:var\(--wp-red\)/);
  });
});

describe('bot hunk (cherry-pick to main)', () => {
  const bot = stripJs(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));
  it('selects and sends the raw radii, and bumps the pack shape', () => {
    expect(bot).toMatch(/gender,slow_mitigation,aggroradius,assistradius&limit=200/);
    expect(bot).toMatch(/aggroradius:\s+r\.aggroradius \?\? null,/);
    expect(bot).toMatch(/assistradius: r\.assistradius \?\? null,/);
    expect(bot).toMatch(/const _MOB_PACK_VERSION = 12;/);
  });
});
