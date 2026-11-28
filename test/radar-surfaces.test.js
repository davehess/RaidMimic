// test/radar-surfaces.test.js — the radar's filled, shaded zone surfaces (the first "3D elements" step of the Map).
//
// ⚙ → Mesh look: Lines (default, as before) / Surfaces / Both. The agent's /api/map-mesh answers tris=1 with the nearest
// triangles of the zone mesh (test/radar-mesh.test.js covers that half); map.html projects them with the radar's own camera,
// drops what cannot be seen, sorts far to near, and fills each with flat shading from a light at the camera, a tint by class
// (floor / wall / ceiling), and fog toward the pane's black.
//
// The helpers run as shipped, from map.html's pure-helpers block (no DOM in there). The mesh's winding is not trustworthy
// (placed models, terrain tiles and zone triangles are wound by different rules), so the tests pin that a triangle is lit and
// classed the same from either side.
//
// Mutation-check (by hand): make surfShade one-sided (drop the Math.abs) and "lit the same from either side" fails; sort
// near-to-far in surfSelect and "far to near" fails; drop the `out.length = o.max` cap and "keeps the nearest" fails.
//
// Run: npx vitest run test/radar-surfaces.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, evalBlock, stripJs, ROOT } from './_source-slice.js';

const MAP_RAW = readSource(path.join(ROOT, 'apps', 'mimic', 'map.html'));
const MAP = stripJs(MAP_RAW);
const H = evalBlock(sliceBlock(MAP_RAW, '// ── pure helpers', '// ── end pure helpers ──'),
  ['surfNormal', 'surfClass', 'surfShade', 'surfFog', 'surfColor', 'surfToScreen', 'surfSelect', 'SURF_AMBIENT', 'radarCam', 'radarPt']);

// A camera at the origin looking toward -y (screen frame: y is south, so "ahead" is -y), z up; depth = -y, no pitch.
const cam = { x: 0, y: 0, z: 0 };
const project = (sx, sy, z) => { const d = -sy; return d < 2 ? null : [400 + sx / d * 300, 300 - z / d * 300, d]; };
const O = { sx: 0, sy: 0, sz: 0, range: 160, dz: 120, max: 100, minArea: 2 };
// A triangle facing the camera in the plane y = -d, size s.
const facing = (d, s = 10, z = 0) => [0, -d, z, s, -d, z, 0, -d, z + s];

describe('surfNormal', () => {
  it('is the unit normal; a flat triangle wound either way is up or down; a sliver has none', () => {
    expect(Array.from(H.surfNormal([0, 0, 0, 1, 0, 0, 0, 1, 0], 0))).toEqual([0, 0, 1]);
    expect(Array.from(H.surfNormal([0, 0, 0, 0, 1, 0, 1, 0, 0], 0))).toEqual([0, 0, -1]);
    expect(H.surfNormal([0, 0, 0, 1, 1, 1, 2, 2, 2], 0)).toBeNull();
  });
});

describe('surfClass: floor, wall or ceiling', () => {
  it('flat ground is a floor whichever way it is wound; flat and above the camera is a ceiling', () => {
    expect(H.surfClass(1, -20)).toBe('floor');
    expect(H.surfClass(-1, -20)).toBe('floor');
    expect(H.surfClass(1, 15)).toBe('ceil');
    expect(H.surfClass(-0.9, 15)).toBe('ceil');
  });
  it('upright is a wall at any height; a ramp or stair face reads as the ground it is', () => {
    expect(H.surfClass(0, -20)).toBe('wall');
    expect(H.surfClass(0.1, 40)).toBe('wall');
    expect(H.surfClass(0.5, -5)).toBe('floor');
    expect(H.surfClass(0.5, 5)).toBe('ceil');
  });
});

describe('surfShade and surfFog', () => {
  it('full light facing the camera, only ambient edge-on, lit the same from either side', () => {
    expect(H.surfShade([0, 0, 1], 0, 0, 5)).toBeCloseTo(1, 6);
    expect(H.surfShade([0, 0, 1], 5, 0, 0)).toBeCloseTo(H.SURF_AMBIENT, 6);
    expect(H.surfShade([0, 0, 1], 0, 0, -5)).toBeCloseTo(H.surfShade([0, 0, 1], 0, 0, 5), 9);
    const slant = H.surfShade([0, 0, 1], 1, 0, 1);
    expect(slant).toBeGreaterThan(H.SURF_AMBIENT);
    expect(slant).toBeLessThan(1);
  });
  it('fog is 1 at the camera, 0 at the range and beyond', () => {
    expect(H.surfFog(0, 100)).toBe(1);
    expect(H.surfFog(50, 100)).toBe(0.5);
    expect(H.surfFog(100, 100)).toBe(0);
    expect(H.surfFog(900, 100)).toBe(0);
    expect(H.surfFog(-5, 100)).toBe(1);
  });
});

describe('surfColor', () => {
  const rgb = [120, 200, 255];
  it('floors, walls and ceilings take different tints of the one style colour', () => {
    const f = H.surfColor(rgb, 'floor', 1, 1), w = H.surfColor(rgb, 'wall', 1, 1), c = H.surfColor(rgb, 'ceil', 1, 1);
    expect(f).toBe('rgb(72,130,191)');
    expect(new Set([f, w, c]).size).toBe(3);
  });
  it('fogged out it is the background black; the gain dims it; shade and fog come in steps', () => {
    expect(H.surfColor(rgb, 'floor', 1, 0)).toBe('rgb(0,0,0)');
    expect(H.surfColor(rgb, 'floor', 1, 1, 0.5)).toBe('rgb(36,65,96)');
    expect(H.surfColor(rgb, 'floor', 0.5, 1)).toBe(H.surfColor(rgb, 'floor', 0.51, 1));
  });
  it('the server frame to the screen frame: x and y negated, z kept', () => {
    expect(Array.from(H.surfToScreen([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toEqual([-1, -2, 3, -4, -5, 6, -7, -8, 9]);
  });
});

describe('surfSelect: what is drawn, and in what order', () => {
  const flat = (t) => t.flat();
  it('drops triangles behind the camera or partly behind it', () => {
    expect(H.surfSelect(flat([facing(-20)]), cam, project, O)).toHaveLength(0);
    expect(H.surfSelect(flat([[0, -50, 0, 10, -50, 0, 0, 1, 10]]), cam, project, O)).toHaveLength(0);   // one corner behind
    expect(H.surfSelect(flat([facing(20)]), cam, project, O)).toHaveLength(1);
  });
  it('drops what is past the range or outside the height band', () => {
    expect(H.surfSelect(flat([facing(200)]), cam, project, O)).toHaveLength(0);
    expect(H.surfSelect(flat([facing(20, 10, 500)]), cam, project, O)).toHaveLength(0);
    expect(H.surfSelect(flat([facing(20, 10, 110)]), cam, project, O)).toHaveLength(1);
  });
  it('drops a triangle seen edge-on, and one too small on screen to see', () => {
    const wall = [0, -30, 0, 0, -40, 0, 0, -30, 10];   // in the plane x = 0, straight ahead: edge-on to a camera on that plane
    expect(H.surfSelect(wall, cam, project, { ...O, minArea: 0 })).toHaveLength(0);
    expect(H.surfSelect(flat([facing(20, 0.01)]), cam, project, O)).toHaveLength(0);
    expect(H.surfSelect(flat([facing(20, 0.01)]), cam, project, { ...O, minArea: 0 })).toHaveLength(1);
  });
  it('is sorted far to near (painter\'s order), each with its class and shade', () => {
    const out = H.surfSelect(flat([facing(30), facing(70), facing(10)]), cam, project, O);
    expect(out.map((s) => Math.round(s.depth))).toEqual([70, 30, 10].map((d) => Math.round(d)));
    expect(out[0].p).toHaveLength(6);
    expect(out[0].cls).toBe('wall');
    expect(out[0].shade).toBeGreaterThan(0.9);   // faces the camera
  });
  it('a big ground triangle reaching far away is painted before a nearer rock standing on it', () => {
    // Ground from 5 to 100 ahead (middle ~37) and a wall-on-end "rock" 50 ahead: by middles the ground would paint last, over it.
    const ground = [-20, -5, -10, 20, -5, -10, 0, -100, -10], rock = [-5, -50, -10, 5, -50, -10, 0, -50, 5];
    const out = H.surfSelect(ground.concat(rock), cam, project, { ...O, minArea: 0 });
    expect(out.map((s) => s.cls)).toEqual(['floor', 'wall']);
  });
  it('a triangle on the ground is a floor and one overhead a ceiling', () => {
    const ground = [-5, -20, -10, 5, -20, -10, 0, -40, -10], over = [-5, -20, 15, 5, -20, 15, 0, -40, 15];
    expect(H.surfSelect(ground, cam, project, { ...O, minArea: 0 })[0].cls).toBe('floor');
    expect(H.surfSelect(over, cam, project, { ...O, minArea: 0 })[0].cls).toBe('ceil');
  });
  it('past the cap it keeps the nearest, still far to near', () => {
    const tris = [];
    for (let d = 10; d <= 100; d += 10) tris.push(facing(d));
    const out = H.surfSelect(tris.flat(), cam, project, { ...O, max: 3 });
    expect(out.map((s) => Math.round(s.depth))).toEqual([30, 20, 10]);
  });
  it('works with the radar\'s own camera and projection', () => {
    const c = H.radarCam({ x: 0, y: 0, z: 0 }, 0), w = 800, h = 600;
    const pj = (sx, sy, z) => H.radarPt(c, sx, sy, z, w, h);
    const at = (k) => Float32Array.from([-5, k * 30, -10, 5, k * 30, -10, 0, k * 50, -10]);   // the ground 30-50 units one side of you
    // one side is ahead of the camera and drawn, the other is behind it and dropped (which is which depends on the heading)
    expect(H.surfSelect(at(-1), c, pj, { ...O, minArea: 0 }).length + H.surfSelect(at(1), c, pj, { ...O, minArea: 0 }).length).toBe(1);
  });
});

describe('map.html: ⚙ → Mesh look and the drawing', () => {
  it('Lines is the default and the choice is remembered', () => {
    expect(MAP).toMatch(/<select id="cfgRadarLook"><option value="lines">Lines<\/option><option value="surfaces">Surfaces<\/option><option value="both">Both<\/option><\/select>/);
    expect(MAP).toMatch(/S\.radarLook = \(function \(\) \{ var v = lsGet\('wp-map-radar-look'\); return v === 'surfaces' \|\| v === 'both' \? v : 'lines'; \}\)\(\);/);
    expect(MAP).toMatch(/lsSet\('wp-map-radar-look', S\.radarLook\);/);
  });
  it('the triangles are asked for only when the look is not Lines', () => {
    expect(MAP).toMatch(/'&r=' \+ MESH_R \+ \(S\.radarLook !== 'lines' \? '&tris=1' : ''\)/);
  });
  it('the draw is capped at 3,000 triangles, and the surfaces go down before the lines', () => {
    expect(MAP).toMatch(/SURF_MAX = 3000/);
    expect(MAP).toMatch(/max: SURF_MAX/);
    const r = MAP.slice(MAP.indexOf('var surfs = meshSegs'));
    expect(r.indexOf('drawSurfaces(g, c, surfs')).toBeGreaterThan(-1);
    expect(r.indexOf('drawSurfaces(g, c, surfs')).toBeLessThan(r.indexOf('drawMesh(g, c, meshSegs'));
    expect(MAP).toMatch(/if \(meshSegs && !\(surfs && S\.radarLook === 'surfaces'\)\) drawMesh\(/);   // Surfaces alone: no lines, once triangles are here
  });
  it('the triangles are one fill each, in the helpers, not a second projection', () => {
    const d = sliceBlock(MAP, '  function drawSurfaces(g, c, tris, ms, sz, w, h, rgb) {', '\n  }\n');
    expect(d).toMatch(/radarPt\(c, sx, sy, z, w, h\)/);
    expect(d).toMatch(/surfSelect\(tris, c,/);
  });
});
