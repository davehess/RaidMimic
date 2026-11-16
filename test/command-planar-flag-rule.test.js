// test/command-planar-flag-rule.test.js — flagged vs not flagged on the Command Center (the guild lead, 2026-11-16).
//
// The 85% rule for Planes of Air/Water/Fire/Earth/Time (zone ids 215-219): a raid may bring unflagged members
// while flagged x 100 >= raid size x 85, counting the whole raid (EQMacEmu c2cd2651 zoning.cpp:41-73,
// raids.cpp:617-638; DECISIONS 596). Runs the agent's real planarFlagRule and the overlay's real row renderer.
// Names are invented. Run: npx vitest run test/command-planar-flag-rule.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, ROOT, sliceBlock, evalBlock } from './_source-slice.js';

const agent = readSource(path.join(ROOT, 'packages', 'wolfpack-logsync', 'index.js'));
const rule = evalBlock(sliceBlock(agent, 'function planarFlagRule(size, flagged) {', 'maxUnflagged - notFlagged : 0, short: passes ? 0 : notFlagged - maxUnflagged,\n  };\n}'),
  ['planarFlagRule']);
const { planarFlagRule: calc } = rule;

const cmd = readSource(path.join(ROOT, 'apps', 'mimic', 'command.html'));
// eslint-disable-next-line no-new-func
const hailRuleHtml = new Function(sliceBlock(cmd, '  function hailRuleHtml(r){', "'</div>';\n  }") + '\nreturn hailRuleHtml;')();

describe('planarFlagRule', () => {
  it('allows size - ceil(0.85 x size) unflagged', () => {
    for (const [size, max] of [[42, 6], [48, 7], [54, 8], [60, 9], [72, 10]]) {
      expect(calc(size, size).max_unflagged).toBe(max);
      expect(calc(size, size - max).passes).toBe(true);
      expect(calc(size, size - max - 1).passes).toBe(false);
    }
  });

  it('reports counts, percentages and the room left', () => {
    const r = calc(42, 37);
    expect(r).toMatchObject({ size: 42, flagged: 37, not_flagged: 5, pct_flagged: 88, pct_not: 12, passes: true, spare: 1, short: 0 });
  });

  it('reports how many too many when it fails', () => {
    const r = calc(42, 34);   // 8 unflagged, 6 allowed
    expect(r).toMatchObject({ passes: false, short: 2, spare: 0 });
  });

  it('is exact on the boundary (85.0% passes)', () => {
    expect(calc(20, 17).passes).toBe(true);
    expect(calc(20, 16).passes).toBe(false);
  });

  it('survives an empty raid and clamps flagged to the size', () => {
    expect(calc(0, 0).passes).toBe(false);
    expect(calc(10, 99).flagged).toBe(10);
  });

});

describe('the Command Center row', () => {
  it('shows counts and percentages for the kill\'s flag', () => {
    const html = hailRuleHtml(calc(42, 37));
    expect(html).toContain('Flagged <b>37 / 42 (88%)</b>');
    expect(html).toContain('Not flagged <b>5 (12%)</b>');
  });

  it('does not show the 85% entry verdict (a kill\'s flag is not a zone\'s entry flag)', () => {
    expect(hailRuleHtml(calc(42, 34))).not.toMatch(/85% rule|too many|room for/);
  });

  it('draws nothing without a rule', () => {
    expect(hailRuleHtml(undefined)).toBe('');
    expect(hailRuleHtml({ size: 0 })).toBe('');
  });

  it('is byte-stable for the same numbers', () => {
    expect(hailRuleHtml(calc(42, 37))).toBe(hailRuleHtml(calc(42, 37)));
  });
});
