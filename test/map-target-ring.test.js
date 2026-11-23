// test/map-target-ring.test.js — your target's own aggro ring draws whether the ◯ aggro-ring switch is on or off
// (the guild lead, 2026-11-18: "TARGETTED MOBS SHOULD SHOW RANGE REGARDLESS OF THE CIRCLE BEING ON OR OFF").
// Run: npx vitest run test/map-target-ring.test.js
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, stripJs, ROOT } from './_source-slice.js';

const MAP = readSource(path.join(ROOT, 'apps', 'mimic', 'map.html'));
const script = stripJs(MAP.slice(MAP.indexOf('<script'), MAP.lastIndexOf('</script>')));

describe('the target ring', () => {
  it('is not behind SH.aggro', () => {
    const at = script.indexOf('var tnpc = targetNpc(P.target, S.points, S.byId);');
    expect(at).toBeGreaterThan(-1);
    const before = script.slice(Math.max(0, at - 80), at);
    expect(before).not.toMatch(/if \(SH\.aggro\)/);
  });
  it('the other spawn points\' rings still follow the switch', () => {
    expect(script).toMatch(/if \(SH\.aggro\) \{/);
  });
});
