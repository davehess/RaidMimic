// test/map-target-lines.test.js — dashed lines on the Map from other raiders running Mimic to their targets.
//
// The guild lead, 2026-11-25: "let's have dashed lines from other targetters running mimic to their target. faint green for
// friendly/NPC, red for engaged mobs, yellow for mobs not engaged/moving."
//
// The bot's side (who is on each mob, scoped) is in test/raid-targets.test.js. Here:
//  1. the agent keeps `by` from the bot's rows, and _mapAims (run as shipped) turns them into one row per raider and mob, you
//     left out, coloured by the mob: hurt = engaged, a /con better than threatening = friendly, else idle;
//  2. map.html draws them dashed, from the raider's drawn spot, in the three colours.
//
// Mutation-checked (by hand, 2026-11-25): drop `b === me` and "you are left out" fails; swap the 'friendly' test to c >= 1 and
// "a threatening con is not friendly" fails; drop the age check and "an old row draws nothing" fails.
//
// Run: npx vitest run test/map-target-lines.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, stripJs, ROOT, AGENT_INDEX } from './_source-slice.js';

const AGENT_RAW = readSource(AGENT_INDEX);
const AGENT = stripJs(AGENT_RAW);
const MAP = stripJs(readSource(path.join(ROOT, 'apps', 'mimic', 'map.html')));

const AIMS = sliceBlock(AGENT_RAW, 'function _mapAims(', '\n  return out;\n}');
const { _mapAims } = new Function('MAP_POS_KEEP_MS', '_mapNormName',
  AIMS + '\nreturn { _mapAims };')(60000, (n) => String(n).toLowerCase().replace(/_/g, ' ').replace(/\d+$/, '').trim());

const NOW = 1_000_000;
const shared = (rows) => ({ pulledAt: NOW, rows: rows.map(r => ({ x: 10, y: 20, z: 0, n: 1, age: 0, ...r })) });

describe('agent: who is on what', () => {
  it('keeps the bot\'s `by` names (lowercase only, at most 12)', () => {
    const apply = sliceBlock(AGENT, 'function _mapApplyShared(', '_mapSync.targets[zone] = { rows, pulledAt: now };');
    expect(apply).toMatch(/const by = Array\.isArray\(t\.by\) \? t\.by\.filter\(b => typeof b === 'string' && \/\^\[a-z\]\{2,30\}\$\/\.test\(b\)\)\.slice\(0, 12\) : \[\];/);
    expect(apply).toMatch(/age: Math\.max\(0, botNow - at\), by \}\);/);
  });
  it('the map feed carries the pairs', () => {
    expect(AGENT).toMatch(/out\.aims = _mapAims\(_mapSync\.targets\[zone\], character, out\.engaged, out\.seen, out\.cons, now\);/);
  });
});

describe('_mapAims', () => {
  it('one row per raider and mob, you left out', () => {
    const out = _mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar', 'brackwyn', 'me'] }]), 'Me', [], [], {}, NOW);
    expect(out.map(a => a.by)).toEqual(['aldenmar', 'brackwyn']);
    expect(out[0]).toMatchObject({ id: 7, name: 'a gnoll', x: 10, y: 20, z: 0 });
  });
  it('a hurt mob is engaged (red), whether the health came from Engaged or seen', () => {
    const e = _mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar'] }]), 'me', [{ spawn_id: 7, hp_pct: 62 }], [], {}, NOW);
    expect(e[0].kind).toBe('engaged');
    const s = _mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar'] }]), 'me', [], [{ spawn_id: 7, hp_pct: 40 }], {}, NOW);
    expect(s[0].kind).toBe('engaged');
  });
  it('full health or dead is not engaged', () => {
    for (const hp of [100, 0]) {
      const out = _mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar'] }]), 'me', [{ spawn_id: 7, hp_pct: hp }], [], {}, NOW);
      expect(out[0].kind).toBe('idle');
    }
  });
  it('a /con better than threatening is friendly (green); a threatening one is not', () => {
    const fr = _mapAims(shared([{ id: 7, name: 'a_gnoll00', by: ['aldenmar'] }]), 'me', [], [], { 'a gnoll': 4 }, NOW);
    expect(fr[0].kind).toBe('friendly');
    const th = _mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar'] }]), 'me', [], [], { 'a gnoll': 1 }, NOW);
    expect(th[0].kind).toBe('idle');
  });
  it('a hurt mob is engaged even if it cons friendly', () => {
    const out = _mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar'] }]), 'me', [{ spawn_id: 7, hp_pct: 50 }], [], { 'a gnoll': 6 }, NOW);
    expect(out[0].kind).toBe('engaged');
  });
  it('an old row draws nothing; a row with no names (an older bot) draws nothing', () => {
    expect(_mapAims(shared([{ id: 7, name: 'a gnoll', by: ['aldenmar'], age: 60001 }]), 'me', [], [], {}, NOW)).toEqual([]);
    expect(_mapAims(shared([{ id: 7, name: 'a gnoll' }]), 'me', [], [], {}, NOW)).toEqual([]);
    expect(_mapAims(null, 'me', [], [], {}, NOW)).toEqual([]);
  });
  it('at most 60 lines', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: 'a gnoll', by: Array.from({ length: 12 }, (_, j) => 'r' + 'abcdefghijkl'[j] + 'x') }));
    expect(_mapAims(shared(rows), 'me', [], [], {}, NOW).length).toBe(60);
  });
});

describe('map.html draws them', () => {
  it('dashed, from the raider\'s drawn spot, in red / yellow / faint green, under the target line switch', () => {
    expect(MAP).toMatch(/var RING = \{ wait: '#f85149', window: '#f0b429', up: '#56d364' \};/);
    expect(MAP).toMatch(/var AIM_COL = \{ engaged: RING\.wait, idle: RING\.window, friendly: RING\.up \};/);
    const block = sliceBlock(MAP, 'if (SH.targetLine && Array.isArray(P.aims) && P.aims.length) {', 'ctx.restore();');
    expect(block).toMatch(/drawn\(src\[0\] \+ m\.name, m, rt\)/);
    expect(block).toMatch(/ctx\.setLineDash\(\[6, 4\]\)/);
    expect(block).toMatch(/ctx\.globalAlpha = a\.kind === 'friendly' \? 0\.35 : 0\.85;/);
    expect(block).toMatch(/ctx\.strokeStyle = AIM_COL\[a\.kind\] \|\| AIM_COL\.idle;/);
    // one dot at each mob's end, so a line never ends in empty space (2026-11-25 screenshot)
    expect(block).toMatch(/if \(!aimEnd\[a\.id\]\) \{[^\n]*\n\s*aimEnd\[a\.id\] = 1;\s*ctx\.beginPath\(\); ctx\.arc\(mq\[0\], mq\[1\], 3\.5/);
  });
});
