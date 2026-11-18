// test/live-state-owner.test.js — what one uploader may say about a character (DECISIONS §638).
// Run: npx vitest run test/live-state-owner.test.js
import { describe, it, expect } from 'vitest';
import { readSource, sliceBlock, evalBlock, stripJs, BOT_INDEX } from './_source-slice.js';

const SRC = readSource(BOT_INDEX);

describe('a raider death time is never later than now', () => {
  const { _noteRaiderDeaths, _lastRaiderDeath } = evalBlock(
    'const _lastRaiderDeath = new Map();\n' + sliceBlock(SRC, 'function _noteRaiderDeaths(deaths) {', '\n}'),
    ['_noteRaiderDeaths', '_lastRaiderDeath']);
  it('a future time is held at the moment it arrives', () => {
    const before = Date.now();
    _noteRaiderDeaths([{ name: 'Aldenmar', ts: '2099-01-01T00:00:00Z' }]);
    const at = _lastRaiderDeath.get('aldenmar');
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
  it('a past time is kept as sent', () => {
    _noteRaiderDeaths([{ name: 'Brackwyn', ts: '2026-11-18T01:00:00Z' }]);
    expect(_lastRaiderDeath.get('brackwyn')).toBe(Date.parse('2026-11-18T01:00:00Z'));
  });
});

describe('the Map target sample comes only from a character the uploader may speak for', () => {
  const handler = stripJs(sliceBlock(SRC, 'async function _handleAgentLiveState(req, res) {', '\n}\n'));
  it('asks whether the character is another member\'s before noting the sample', () => {
    const ask = handler.indexOf('_characterBelongsToAnotherMember(identity, character)');
    const note = handler.indexOf('_raidTargets().noteSample(');
    expect(ask).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(note);
    expect(handler).toMatch(/if \(!foreignChar\) try \{\s*_raidTargets\(\)\.noteSample\(/);
  });
});
