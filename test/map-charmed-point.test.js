// A seen mob that is now a charm pet (the guild lead, 2026-11-17: "charm pets aren't showing up on the map"): the agent's map
// state marks the seen row `charmed_by` (matched by spawn id against the charm tracker), and the Map draws no aggro ring for
// that point and labels it "charmed". Comments are stripped before matching (CLAUDE.md).
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, stripJs, sliceBlock, AGENT_INDEX, ROOT } from './_source-slice.js';

const AGENT = stripJs(sliceBlock(readSource(AGENT_INDEX), 'function _mapStatePayload(have, now, haveLocal, haveRoute) {', '\n}'));
const MAP = stripJs(readSource(path.join(ROOT, 'apps', 'mimic', 'map.html')));

describe('a charmed mob on the Map', () => {
  it('the map state marks the seen row by spawn id from the active charms', () => {
    expect(AGENT).toMatch(/c\.is_active && Number\(c\.pet_id\) > 0\) charmById\.set\(Number\(c\.pet_id\)/);
    expect(AGENT).toMatch(/s\.charmed_by = charmById\.get\(Number\(s\.spawn_id\)\)/);
  });
  it('the Map skips the aggro ring for it, at its point and where it moved', () => {
    expect(MAP).toMatch(/S\.seenBy\[String\(ap\.id\)\] && S\.seenBy\[String\(ap\.id\)\]\.charmed_by\) continue;/);
    expect(MAP).toMatch(/S\.seenBy\[movedPids\[mi\]\] && S\.seenBy\[movedPids\[mi\]\]\.charmed_by\) continue;/);
  });
  it('and labels it charmed', () => {
    expect(MAP).toMatch(/up\.charmed_by \? ' · charmed' : ''/);
  });
});
