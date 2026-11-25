// test/radar-mesh.test.js — the radar's wireframe from the server's zone mesh (Decision Desk radar-sense B).
// (test/zone-mesh.test.js is the web replay's packed mesh; this file is the agent + Mimic radar.)
//
// The guild lead, 2026-11-25: "get going on the wireframe", after the raised map lines showed a hill edge in Plane of
// Tranquility as a wall. The agent downloads EQEmu's base/<zone>.map once, decodes it the way the server's Map::LoadV2 does
// (zone triangles, placed models, terrain tiles), keeps only the FEATURE edges (creases and borders; flat ground's inner
// triangle edges are dropped), and answers /api/map-mesh with the edges around you. map.html draws them on the radar.
//
// The decoder runs as shipped on a small v2 file built here: one zone triangle, one model placed at (100, 200, 5) at scale 2
// (the server swaps x and y for placed models), and one flat terrain tile.
// Checked by hand on the real potranquility.map (2026-11-25): 264,634 triangles, 123,313 feature edges, the library's
// bookcases and desk drawn, no hill line by the arrival huts.
//
// Mutation-checked (by hand, 2026-11-25): skip the three header fields after plac_group_count and the decode test fails; drop
// the x/y swap for placed models and "a placed model" fails; keep coplanar edges and the cube has 18 edges, not 12.
//
// Run: npx vitest run test/radar-mesh.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readSource, sliceBlock, stripJs, ROOT, AGENT_INDEX } from './_source-slice.js';
import { parseEqemuMap } from '../web/lib/zoneMap/slice.ts';

const AGENT_RAW = readSource(AGENT_INDEX);
const AGENT = stripJs(AGENT_RAW);
const MAP_RAW = readSource(path.join(ROOT, 'apps', 'mimic', 'map.html'));
const MAP = stripJs(MAP_RAW);

const BLOCK = sliceBlock(AGENT_RAW, 'const MAP_MESH_BASE', '// ── end Zone meshes ──');
function boot(meshDir) {
  const paths = { mesh: meshDir };
  return new Function('fs', 'zlib', 'path', 'https', '_mapPaths',
    BLOCK + '\nreturn { _meshDecode, _meshEdges, _meshGrid, _mapMeshNear, _mapMeshAnswer, _mapMeshEnsure, _mapMeshNet };')(fs, zlib, path, null, paths);
}

// A v2 .map: uint32 version, uint32 data_size, uint32 buffer_size, zlib(payload).
function mapFile() {
  const parts = [];
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); parts.push(b); };
  const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); parts.push(b); };
  const str = (s) => parts.push(Buffer.from(s + '\0', 'latin1'));
  const u8 = (v) => parts.push(Buffer.from([v]));
  // vert, ind, nc vert, nc ind, model, placeable, group, tile counts; quads per tile; units per vertex
  [3, 3, 0, 0, 1, 1, 0, 1, 1].forEach(u32); f32(10);
  [[0, 0, 0], [10, 0, 0], [0, 10, 0]].forEach((v) => v.forEach(f32));
  [0, 1, 2].forEach(u32);
  str('BOX'); u32(3); u32(1); [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((v) => v.forEach(f32)); [0, 1, 2].forEach(u32); u8(1);
  str('BOX'); [100, 200, 5, 0, 0, 0, 2, 2, 2].forEach(f32);
  u8(1); f32(50); f32(60); f32(-3);   // a flat tile at (50, 60), z -3
  const payload = Buffer.concat(parts), z = zlib.deflateSync(payload), head = Buffer.alloc(12);
  head.writeUInt32LE(0x02000000, 0); head.writeUInt32LE(z.length, 4); head.writeUInt32LE(payload.length, 8);
  return Buffer.concat([head, z]);
}
const tri = (T, i) => Array.from(T.slice(i * 9, i * 9 + 9)).map((v) => Math.round(v * 100) / 100);

describe('agent: decoding a zone mesh the way the server does', () => {
  const api = boot(null);
  const T = api._meshDecode(mapFile());
  it('reads the zone triangles, the placed model and the terrain tile: four triangles', () => {
    expect(T.length / 9).toBe(4);
    expect(tri(T, 0)).toEqual([0, 0, 0, 10, 0, 0, 0, 10, 0]);
  });
  it('a placed model: scaled, moved, then x and y swapped, as Map::LoadV2 does', () => {
    expect(tri(T, 1)).toEqual([200, 100, 5, 200, 102, 5, 202, 100, 5]);
  });
  it('a flat terrain tile is one quad, two triangles, at its height', () => {
    expect(tri(T, 2)).toEqual([50, 70, -3, 60, 60, -3, 60, 70, -3]);
    expect(tri(T, 3)).toEqual([50, 70, -3, 50, 60, -3, 60, 60, -3]);
  });
  it('the zone triangles agree with the web replay\'s parser (web/lib/zoneMap/slice.ts), which reads only those', () => {
    const { V, I } = parseEqemuMap(mapFile());
    const web = Array.from(I).flatMap((k) => [V[k * 3], V[k * 3 + 1], V[k * 3 + 2]]);
    expect(tri(T, 0)).toEqual(web);
  });
  it('refuses a file it cannot read rather than drawing junk', () => {
    const bad = mapFile(); bad.writeUInt32LE(0x01000000, 0);
    expect(() => api._meshDecode(bad)).toThrow(/version/);
    expect(() => api._meshDecode(Buffer.alloc(4))).toThrow(/short/);
  });
});

describe('agent: feature edges', () => {
  const api = boot(null);
  // A unit cube, two triangles a side.
  const P = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const cube = Float32Array.from(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d].flatMap((k) => P[k])));
  it('a cube is its 12 edges: the diagonals across each flat side are dropped', () => {
    expect(api._meshEdges(cube).length / 6).toBe(12);
  });
  it('one flat square (two triangles) is its 4 border edges', () => {
    expect(api._meshEdges(cube.slice(0, 18)).length / 6).toBe(4);
  });
  it('the radius query keeps what is near you, on your floor', () => {
    const segs = Float32Array.from([0, 0, 0, 10, 0, 0, 500, 0, 0, 510, 0, 0, 0, 5, 400, 10, 5, 400]);
    const m = { segs, grid: api._meshGrid(segs) };
    expect(api._mapMeshNear(m, 0, 0, 0, 100, 200)).toEqual([0, 0, 0, 10, 0, 0]);
    expect(api._mapMeshNear(m, 0, 0, null, 100, 200).length / 6).toBe(2);   // no height known: every floor
  });
});

describe('agent: /api/map-mesh', () => {
  it('a zone on disk answers with the edges around you; one not there starts its download and says loading', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-'));
    try {
      fs.writeFileSync(path.join(dir, 'testzone.map'), mapFile());
      const api = boot(dir);
      const q = (o) => new URLSearchParams(o);
      const a = api._mapMeshAnswer(q({ zone: 'testzone', x: '0', y: '0', z: '0', r: '100' }), 0);
      expect(a).toMatchObject({ ok: true, zone: 'testzone', status: 'ready', source: 'EQEmu server map' });
      expect(a.segs.length % 6).toBe(0);
      expect(a.segs.length).toBeGreaterThan(0);
      const asked = [];
      api._mapMeshNet.get = (url) => { asked.push(url); return new Promise(() => {}); };
      expect(api._mapMeshAnswer(q({ zone: 'otherzone', x: '0', y: '0' }), 0).status).toBe('loading');
      expect(asked).toEqual(['https://raw.githubusercontent.com/EQEmu/maps/master/base/otherzone.map']);
      expect(api._mapMeshAnswer(q({ zone: '../etc', x: '0', y: '0' }), 0).status).toBe('off');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('is routed as a GET', () => {
    expect(AGENT).toMatch(/req\.url\.split\('\?'\)\[0\] === '\/api\/map-mesh' && req\.method === 'GET'\) \{\s*let ans;\s*try \{ ans = _mapMeshAnswer\(new URL\(req\.url, 'http:\/\/x'\)\.searchParams, Date\.now\(\)\); \}/);
  });
});

describe('map.html: the radar draws the mesh', () => {
  const meshBits = sliceBlock(MAP, '  function meshWanted(me, zone, now) {', '\n  function meshFetch(me, zone) {').replace('\n  function meshFetch(me, zone) {', '');
  const boot2 = (S) => new Function('S', 'MESH_MOVE', 'MESH_RETRY_MS', meshBits + '\nreturn { meshWanted, meshToScreen };')(S, 120, 3000);
  it('asks for a new zone, after moving MESH_MOVE, and again after a "loading"; never while one is out', () => {
    const me = { x: 0, y: 0 };
    expect(boot2({ mesh: null }).meshWanted(me, 'z', 0)).toBe(true);
    expect(boot2({ mesh: { zone: 'z', x: 0, y: 0, status: 'ready' } }).meshWanted({ x: 100, y: 0 }, 'z', 0)).toBe(false);
    expect(boot2({ mesh: { zone: 'z', x: 0, y: 0, status: 'ready' } }).meshWanted({ x: 130, y: 0 }, 'z', 0)).toBe(true);
    expect(boot2({ mesh: { zone: 'z', x: 0, y: 0, status: 'loading', at: 0 } }).meshWanted(me, 'z', 3500)).toBe(true);
    expect(boot2({ mesh: { zone: 'z', x: 0, y: 0, status: 'none', at: 0 } }).meshWanted(me, 'z', 99999)).toBe(false);
    expect(boot2({ mesh: { zone: 'z', busy: true } }).meshWanted({ x: 999, y: 0 }, 'z', 0)).toBe(false);
    expect(boot2({ mesh: { zone: 'a', x: 0, y: 0, status: 'ready' } }).meshWanted(me, 'b', 0)).toBe(true);
  });
  it('server frame to screen frame: x and y negated, z kept', () => {
    expect(Array.from(boot2({}).meshToScreen([1, 2, 3, 4, 5, 6]))).toEqual([-1, -2, 3, -4, -5, 6]);
  });
  it('renderRadar draws the mesh when it is here, else the grid and the raised map lines', () => {
    const r = sliceBlock(MAP, 'function renderRadar(rt) {', 'var body = function (sx, sy, z, radius, tall, style, label) {');
    expect(r).toMatch(/meshFetch\(me, S\.zone\);\s*var meshSegs = S\.radarWalls === 'mesh' && S\.mesh && S\.mesh\.zone === S\.zone \? S\.mesh\.segs : null;\s*var rst = [^\n]*\n\s*if \(meshSegs\) drawMesh\(/);
    expect(r).toMatch(/for \(var k = -80; k <= 80 && !meshSegs; k \+= 10\)/);
    expect(r).toMatch(/if \(!meshSegs && localWalls\(\)\) \{/);
    expect(r).toMatch(/\} else if \(!meshSegs\) \{\s*g\.globalAlpha = 0\.8;[^\n]*\n\s*g\.fillText\('No map file for this zone/);
  });
  it('⚙ → Radar walls: Zone mesh (default) or Map lines, remembered', () => {
    expect(MAP).toMatch(/<select id="cfgRadarWalls"><option value="mesh">Zone mesh<\/option><option value="lines">Map lines<\/option><\/select>/);
    expect(MAP).toMatch(/S\.radarWalls = lsGet\('wp-map-radar-walls'\) === 'lines' \? 'lines' : 'mesh';/);
  });
  it('the corner says which walls it draws', () => {
    const f = new Function('S', 'localWalls', sliceBlock(MAP, '  function radarWallsTxt(meshSegs) {', "return localWalls() ? 'Walls: map lines (' + why + ')' : '';\n  }") + '\nreturn radarWallsTxt;');
    expect(f({}, () => true)([1])).toBe('Walls: zone mesh (EQEmu server map)');
    expect(f({ radarWalls: 'mesh', zone: 'z', mesh: { zone: 'z', status: 'none' } }, () => true)(null)).toBe('Walls: map lines (no zone mesh for this zone)');
    expect(f({ radarWalls: 'mesh', zone: 'z', mesh: null }, () => true)(null)).toBe('Walls: map lines (zone mesh loading…)');
    expect(f({ radarWalls: 'lines' }, () => true)(null)).toBe('Walls: map lines');
  });
  it('one stroke per brightness step', () => {
    const d = sliceBlock(MAP, '  function drawMesh(g, c, segs, ms, sz, w, h, col, style, t) {', '\n  }\n');
    expect(d).toMatch(/paths\[Math\.min\(MESH_ALPHA_STEPS - 1, Math\.floor\(a \* MESH_ALPHA_STEPS\)\)\]\.push\(p\);/);
    expect(d.match(/g\.stroke\(\)/g)).toHaveLength(1);
  });
});

// Radar styles (the guild lead, 2026-11-25: "the whole point is to differentiate that you're blind and give visual hints to
// what's around you. little pulses on wire mesh or other visual styles would be amazing"). radarGlow runs as shipped.
describe('map.html: radar styles', () => {
  const block = sliceBlock(MAP, '  var PULSE_MS = 1800,', "    return Math.max(0.12, Math.min(1, 1.1 - d / RADAR_R));\n  }");
  const glow = new Function('lsGet', 'S', 'RADAR_STYLES', 'RADAR_R', block + '\nreturn { radarGlow, PULSE_MS, SWEEP_MS, RADAR_DARK };')(
    () => null, {}, { pulse: {}, sweep: {}, ember: {}, plain: {} }, 160);
  const g = glow.radarGlow;
  it('pulse: a wall is dark before the ring reaches it, bright as it passes, fading after', () => {
    const v = 160 * 1.15 / glow.PULSE_MS, d = 80, hit = d / v;   // ms after the ring leaves that it reaches d
    expect(g('pulse', d, 0, hit - 200)).toBeLessThan(0.2);   // only the last ring's tail, 1.6 s old
    expect(g('pulse', d, 0, hit + 10)).toBeGreaterThan(0.9);
    expect(g('pulse', d, 0, hit + 700)).toBeLessThan(g('pulse', d, 0, hit + 100));
    const at30 = 30 / v;   // the ring is 30 out: the wall at 10 was just lit, the one at 150 has the last ring's tail
    expect(g('pulse', 10, 0, at30)).toBeGreaterThan(g('pulse', 150, 0, at30));
  });
  it('sweep: the wall the beam is on is bright, the one opposite is dark', () => {
    const t = glow.SWEEP_MS / 4;   // beam at 90 degrees
    expect(g('sweep', 50, Math.PI / 2, t)).toBeGreaterThan(0.9);
    expect(g('sweep', 50, -Math.PI / 2, t)).toBeLessThan(0.35);   // half a turn old
  });
  it('ember breathes and stays lit; plain is steady and fades with distance', () => {
    const a = g('ember', 40, 0, 0), b = g('ember', 40, 0, 1300);
    expect(a).not.toBeCloseTo(b, 2);
    expect(Math.min(a, b)).toBeGreaterThanOrEqual(0.15);
    expect(g('plain', 20, 0, 0)).toBe(g('plain', 20, 1, 9999));
    expect(g('plain', 20, 0, 0)).toBeGreaterThan(g('plain', 150, 0, 0));
  });
  it('⚙ → Radar style, remembered, pulse by default; the moving styles run their own frame loop and tint the edges', () => {
    expect(MAP).toMatch(/<select id="cfgRadarStyle"><option value="pulse">Pulse<\/option><option value="sweep">Sweep<\/option><option value="ember">Ember<\/option><option value="plain">Plain<\/option><\/select>/);
    expect(MAP).toMatch(/S\.radarStyle = \(function \(\) \{ var v = lsGet\('wp-map-radar-style'\); return RADAR_STYLES\[v\] \? v : 'pulse'; \}\)\(\);/);
    expect(MAP).toMatch(/return !document\.hidden && !!S\.radarView && S\.radarView !== 'map' && !!\(RADAR_STYLES\[S\.radarStyle\] \|\| \{\}\)\.anim;/);
    expect(MAP).toMatch(/radarEl\.hidden = v === 'map';\s*resize\(\);\s*kickRadar\(\);/);
    expect(MAP).toMatch(/if \(rst\.anim\) drawRadarVignette\(g, w, h, rst\.rgb\);/);
    expect(MAP).toMatch(/if \(meshSegs\) drawMesh\(g, c, meshSegs, ms, sz, w, h, rcol, S\.radarStyle, rt\);/);
  });
});
