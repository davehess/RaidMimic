// test/elementals-ring-maps.test.js — the elemental planes' ring steps show a map, not raw positions (the guild lead,
// 2026-11-18: "INSTEAD OF POSITION YOU SHOULD SHOW A MAP"). The page script turns the coordinates in each event's steps
// into points (database order, drawn at (-x,-y) in the map frame) and rewrites the step text to point at the mini-map.
//
// Run: npx vitest run test/elementals-ring-maps.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sliceBlock, evalBlock, stripJs } from './_source-slice.js';

const raw = fs.readFileSync(path.join(ROOT, 'web/public/pop/elementals.html'), 'utf8');
const planes = JSON.parse(raw.match(/^const PLANES = (.*);$/m)[1]);
const { evPoints } = evalBlock(sliceBlock(raw, 'const CIRC =', "trigger, pts };\n}"), ['evPoints']);
const mud = planes.earth.plane.events.find(e => /^Mud Ring/.test(e.title));

describe('elementals ring mini-maps', () => {
  it('the page script has the mini-map render function and draws it under each event title', () => {
    const src = stripJs(raw);
    expect(src).toMatch(/function drawRingMap\(/);
    expect(src).toMatch(/<h3>\$\{esc\(ev\.title\)\}<\/h3>\$\{evp\[ei\]\.pts\.length \? `<div class="evmap"/);
  });

  it('the data still carries the raw positions (JSON shape unchanged)', () => {
    expect(mud.steps[4]).toContain('(397,149)');
  });

  it('Mud ring step 5 reads "at (5) on the map" with no raw numbers, and its four points are plotted', () => {
    const r = evPoints(mud);
    expect(r.steps[4]).not.toContain('(397,149)');
    expect(r.steps[4]).not.toMatch(/\d+,\s*-?\d+/);
    expect(r.steps[4]).toContain('⑤ on the map');
    expect(r.pts.filter(p => p.step === 5).map(p => [p.x, p.y]))
      .toEqual([[-397, -149], [-283, -149], [-397, -34], [-283, -34]]);
  });

  it('a database position lands on the same spot as the named marker of the same mob (Lurker DB (339,92,82))', () => {
    const lurker = planes.earth.plane.named.find(n => n.name === 'A Sludge Lurker').map;
    const p = evPoints(mud).pts.find(q => q.step === 2);
    expect([p.x, p.y]).toEqual([lurker[0], lurker[1]]);
  });

  it('each of the four Earth rings has its Nov 18 kite circle, matched by the event title', () => {
    const { kiteFor } = evalBlock(sliceBlock(raw, 'const KITE_NOV18 = {', "split(' (')[0]] || null;"), ['kiteFor']);
    const rings = planes.earth.plane.events.filter(e => /^(Stone|Mud|Vine|Dust) Ring/.test(e.title));
    expect(rings.length).toBe(4);
    for (const ev of rings) {
      const k = kiteFor(ev);
      expect(k, ev.title).toBeTruthy();
      expect(k.d.split(' ').length).toBeGreaterThan(50);
      expect(k.r).toBeGreaterThan(0);
    }
    expect(kiteFor(planes.earth.plane.events.find(e => /^Arbitor/.test(e.title)))).toBeNull();
    expect(stripJs(raw)).toMatch(/drawRingMap\(slot, key, mi, P\.maps\[mi\], evp\[ei\]\.pts, key === 'earth' \? kiteFor\(ev\) : null\)/);
  });

  it('every earth ring step is free of raw coordinate pairs after the rewrite', () => {
    for (const ev of planes.earth.plane.events) {
      const r = evPoints(ev);
      for (const s of [...r.steps, r.trigger || '']) expect(s).not.toMatch(/\(-?\d+(\.\d+)?,\s*-?\d+(,\s*-?\d+)?\)|[ (](?!\d{1,3}(,\d{3}){2,}\b)-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d|\.\.-?\d/);
    }
  });
});
