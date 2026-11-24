// test/slow-result-line.test.js — "Your spell was mostly successful." after your own slow.
//
// Quarm patch 2026-11-23 (EQMacEmu 4754fef, zone/mob.cpp SlowMitigation, string ids 9029-9032): the caster of a
// slow is told how well it took. The line names no target and no spell, so the agent ties it to the newest own
// slow landing, inside 2 s of it, and records `slowResult` on that entry (returned as `result` by
// _bestSlowForTarget). Runs the REAL functions sliced from the agent; the log line text is the server's own.
//
// Run: npx vitest run test/slow-result-line.test.js

import { describe, it, expect } from 'vitest';
import { readSource, sliceBlock, AGENT_INDEX } from './_source-slice.js';

const agent = readSource(AGENT_INDEX);
const slowBlock = sliceBlock(agent, 'const SLOW_SPELLS = new Set([', '// ── end #130 slow status');

function build() {
  // eslint-disable-next-line no-new-func
  return new Function(`
    function _pushOverlay() {}
    function _rampageOnMainTarget() { return false; }
    function _durTicksForLevel(f, d) { return Number(d) || 0; }
    function _assumedCasterLevel() { return 60; }
    function parseEqTimestamp(line) { const m = String(line).match(/^\\[(.+?)\\]/); return m ? new Date(m[1] + ' UTC') : null; }
    function _watchedTargetId() { return null; }
    ${slowBlock}
    return { _noteSlowForTarget, _bestSlowForTarget, noteSlowResultLine };
  `)();
}

const BOAR = 'A War Boar';
const landed = (h, at) => h._noteSlowForTarget(
  { spell_name: 'Tepid Deeds', target: BOAR, dur_formula: 7, dur_ticks: 65, cast_at: at }, 'Aldenmar');
const stamp = (s) => `[Fri Oct 16 20:00:${s} 2026]`;
const AT = Date.parse('Fri Oct 16 20:00:00 2026 UTC');

describe('slow result line', () => {
  const lines = {
    mostly: 'Your spell was mostly successful.',
    partially: 'Your spell was partially successful.',
    slightly: 'Your spell was slightly successful.',
    opposite: 'Your spell may have had the opposite effect of what you desired.',
  };
  for (const [word, text] of Object.entries(lines)) {
    it(`"${text}" inside 2 s of your own slow records ${word}`, () => {
      const h = build();
      landed(h, new Date(AT).toISOString());
      expect(h.noteSlowResultLine(`${stamp('01')} ${text}`, 'Aldenmar')).toBe(word);
      expect(h._bestSlowForTarget(BOAR.toLowerCase(), AT + 1000).result).toBe(word);
    });
  }

  it('a slow that never printed a result carries result null', () => {
    const h = build();
    landed(h, new Date(AT).toISOString());
    expect(h._bestSlowForTarget(BOAR.toLowerCase(), AT + 1000).result).toBeNull();
  });

  it('a result line more than 2 s after the landing is ignored', () => {
    const h = build();
    landed(h, new Date(AT).toISOString());
    expect(h.noteSlowResultLine(`${stamp('05')} ${lines.mostly}`, 'Aldenmar')).toBeNull();
    expect(h._bestSlowForTarget(BOAR.toLowerCase(), AT + 5000).result).toBeNull();
  });

  it('a result line with no own slow landing, or from another character, is ignored', () => {
    const h = build();
    expect(h.noteSlowResultLine(`${stamp('01')} ${lines.mostly}`, 'Aldenmar')).toBeNull();
    landed(h, new Date(AT).toISOString());
    expect(h.noteSlowResultLine(`${stamp('01')} ${lines.mostly}`, 'Brackwyn')).toBeNull();
  });

  it('a bystander-seen slow (no caster) is never given a result', () => {
    const h = build();
    h._noteSlowForTarget({ spell_name: 'Tepid Deeds', target: BOAR, dur_formula: 7, dur_ticks: 65, cast_at: new Date(AT).toISOString() }, null);
    expect(h.noteSlowResultLine(`${stamp('01')} ${lines.mostly}`, 'Aldenmar')).toBeNull();
  });
});
