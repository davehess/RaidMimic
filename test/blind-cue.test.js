// test/blind-cue.test.js — the blind cue: hitting, too far, turn left or right, and the moving arrows to the target.
//
// The guild lead, 2026-11-26: "for blind mode we need to know if we're hitting, too far, turned away from the target and to
// turn left or right, and show the motion arrows towards the mob during the blind mode".
// The agent reads your own swings and the server's range messages (EQMacEmu zone/string_ids.h CANT_SEE_TARGET 108,
// CANT_HIT_THEM 123, TARGET_TOO_FAR 124) while blind; map.html's blindCue turns that, your heading and the target's reach
// into one line, and chevrons() draws the arrows. Both run as shipped here.
//
// Mutation-checked (by hand, 2026-11-26): flip the sign of `right` in blindCue and "right means the radar's right" fails;
// drop the blind check in noteBlindSwing and "nothing while not blind" fails.
//
// Run: npx vitest run test/blind-cue.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, sliceBlock, stripJs, ROOT, AGENT_INDEX } from './_source-slice.js';

const MAP = stripJs(readSource(path.join(ROOT, 'apps', 'mimic', 'map.html')));
const AGENT_RAW = readSource(AGENT_INDEX);
const AGENT = stripJs(AGENT_RAW);

const geo = sliceBlock(MAP, '  var HEADING_CCW = true;', '    return rot ? turnVec(v.dx, v.dy, rot) : v;\n  }');
const cue = sliceBlock(MAP, '  var BLIND_FACE_DEG = 45,', '    return n;\n  }');
const M = new Function(geo + '\n' + cue + '\nreturn { blindCue, chevrons, headingVec, toScreen };')();   // pure: no page needed
const me = (heading) => ({ x: 0, y: 0, z: 0, heading });

describe('blindCue', () => {
  const ahead = (h, d) => {   // a point d ahead of someone at the origin facing h, in the server frame
    const f = M.headingVec(h); return { x: -f.dx * d, y: -f.dy * d };   // screen = (-x, -y)
  };
  it('no target: says so', () => {
    expect(M.blindCue(me(0), 0, null, null, null)).toMatchObject({ kind: 'none', text: 'NO TARGET' });
  });
  it('in front and inside its reach: in range; your last swing says hitting or missing', () => {
    const t = ahead(0, 10);
    expect(M.blindCue(me(0), 0, t, { melee: 14 }, null)).toMatchObject({ kind: 'in', tone: 'ok' });
    expect(M.blindCue(me(0), 0, t, { melee: 14 }, { kind: 'hit', age_ms: 300 })).toMatchObject({ kind: 'hit', text: '● HITTING' });
    expect(M.blindCue(me(0), 0, t, { melee: 14 }, { kind: 'miss', age_ms: 300 })).toMatchObject({ kind: 'miss' });
    expect(M.blindCue(me(0), 0, t, { melee: 14 }, { kind: 'hit', age_ms: 5000 }).kind).toBe('in');   // an old swing is not news
  });
  it('past its reach, or the server says too far: too far, with the distance', () => {
    const c = M.blindCue(me(0), 0, ahead(0, 40), { melee: 14 }, null);
    expect(c).toMatchObject({ kind: 'far', tone: 'warn', dist: 40, inReach: false });
    expect(c.text).toBe('▲ TOO FAR · 40 away, reach 14');
    expect(M.blindCue(me(0), 0, ahead(0, 10), { melee: 14 }, { kind: 'far', age_ms: 100 }).kind).toBe('far');
  });
  it('turned away: turn left or right, before anything about range', () => {
    for (const off of [90, 160]) {
      const r = M.blindCue(me(0), 0, ahead(off, 40), { melee: 14 }, null), l = M.blindCue(me(0), 0, ahead(-off, 40), { melee: 14 }, null);
      expect(r.kind).toBe('turn'); expect(l.kind).toBe('turn');
      expect(Math.sign(r.turn)).toBe(-Math.sign(l.turn));
    }
    expect(M.blindCue(me(0), 0, ahead(20, 10), { melee: 14 }, null).kind).toBe('in');   // a small angle is still facing
    // …but the server's "You can't hit them from here." with any real turn says turn
    expect(M.blindCue(me(0), 0, ahead(20, 10), { melee: 14 }, { kind: 'cant_hit', age_ms: 200 }).kind).toBe('turn');
  });
  it('"right" means the radar\'s right: the same right-hand vector as radarCam', () => {
    expect(MAP).toMatch(/fx: f\.dx, fy: f\.dy, rx: -f\.dy, ry: f\.dx,/);   // radarCam
    const f = M.headingVec(0), rx = -f.dy, ry = f.dx;
    const t = { x: -rx * 30, y: -ry * 30 };   // 30 along the radar's right, in the server frame
    const c = M.blindCue(me(0), 0, t, { melee: 14 }, null);
    expect(c.turn).toBeGreaterThan(0);
    expect(c.text).toMatch(/^TURN RIGHT 90° ▶$/);
  });
  it('the server saying it cannot see the target comes first', () => {
    expect(M.blindCue(me(0), 0, ahead(90, 40), { melee: 14 }, { kind: 'no_los', age_ms: 100 })).toMatchObject({ kind: 'no_los', tone: 'bad' });
  });
  it('no heading known: no turn advice, the rest still works', () => {
    expect(M.blindCue(me(null), null, { x: 0, y: 40 }, { melee: 14 }, null)).toMatchObject({ kind: 'far', turn: null });
  });
});

describe('chevrons', () => {
  it('fills the way from you to the target, stops short of it, and slides with time', () => {
    const strokes = [], line = (...a) => strokes.push(a);
    const n = M.chevrons(0, 0, 100, 0, 0, 10, 20, 15, 3, line);
    expect(n).toBe(8);   // 10 apart over the 85 before the stop
    expect(strokes).toHaveLength(16);   // two strokes each
    expect(Math.max(...strokes.map((s) => s[2]))).toBeLessThan(85);
    const a = [], b = [];
    M.chevrons(0, 0, 100, 0, 0, 10, 20, 15, 3, (...s) => a.push(s));
    M.chevrons(0, 0, 100, 0, 250, 10, 20, 15, 3, (...s) => b.push(s));
    expect(b[1][2]).not.toBe(a[1][2]);
    expect(M.chevrons(0, 0, 10, 0, 0, 10, 20, 15, 3, () => {})).toBe(0);   // already there: none
  });
});

describe('map.html wiring', () => {
  it('the cue reads the feed every poll, shows in every Blind view, and the arrows draw on the Map and the radar', () => {
    expect(MAP).toMatch(/syncBlindCue\(p\);/);
    expect(MAP).toMatch(/S\.cue = blindCue\(me, me && me\.heading, t, t \? targetReach\(t\) : null, p\.swing\);/);
    expect(MAP).toMatch(/<div id="blindCue" class="bcue" hidden><\/div>/);
    expect(MAP).toMatch(/if \(S\.blind && S\.cue && S\.cue\.kind !== 'none' && P\.self && P\.self\.x != null\) \{/);
    expect(MAP).toMatch(/chevrons\(ms\.sx, ms\.sy, ts\.sx, ts\.sy, rt, 6, 14,/);
    expect(MAP).toMatch(/\|\| !!\(S\.blind && S\.cue && S\.cue\.kind !== 'none'\); \}/);   // the Map keeps animating while blind
  });
});

describe('agent: your swings while blind', () => {
  const block = sliceBlock(AGENT_RAW, 'const _blindSwing = {};', '\n}\n');
  const boot = (blind) => {
    const state = { aldenmar: { active: blind } };
    const f = new Function('_blindState', 'parseEqTimestamp', block + '\nreturn { noteBlindSwing, _blindSwing };');
    return f(state, () => new Date(1000));
  };
  const L = (s) => '[Thu Nov 26 20:00:00 2026] ' + s;
  it('reads hits, misses and the server\'s three range messages', () => {
    const cases = [
      ['You slash a Boruk minion for 45 points of damage.', 'hit'],
      ['You try to slash a Boruk minion, but miss!', 'miss'],
      ['You try to crush a Boruk minion, but a Boruk minion parries!', 'miss'],
      ['Your target is too far away, get closer!', 'far'],
      ["You can't hit them from here.", 'cant_hit'],
      ['You cannot see your target.', 'no_los'],
    ];
    for (const [line, kind] of cases) {
      const a = boot(true); a.noteBlindSwing(L(line), 'Aldenmar');
      expect(a._blindSwing.aldenmar && a._blindSwing.aldenmar.kind, line).toBe(kind);
    }
  });
  it('ignores a mob hitting you, spell damage, and anything while not blind', () => {
    for (const line of ['A Boruk minion hits YOU for 80 points of damage.', 'You hit a Boruk minion for 300 points of non-melee damage.']) {
      const a = boot(true); a.noteBlindSwing(L(line), 'Aldenmar');
      expect(a._blindSwing.aldenmar, line).toBeUndefined();
    }
    const n = boot(false); n.noteBlindSwing(L('You slash a Boruk minion for 45 points of damage.'), 'Aldenmar');
    expect(n._blindSwing.aldenmar).toBeUndefined();
  });
  it('is called for every line, and the map feed carries the last one for 6 s', () => {
    expect(AGENT).toMatch(/noteBlindLine\(line, b\.character\);\s*noteBlindSwing\(line, b\.character\);/);
    expect(AGENT).toMatch(/if \(sw && now - sw\.at < 6000\) out\.swing = \{ kind: sw\.kind, age_ms: Math\.max\(0, now - sw\.at\) \};/);
  });
});
