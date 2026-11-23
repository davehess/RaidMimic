// A zone's mob pack saved under an older row shape is checked again at once (the guild lead, 2026-11-16: Target Info
// showed no aggro or assist radius on a Plane of Air mob whose pack was fetched before the bot started sending them).
import { describe, it, expect } from 'vitest';
import { readSource, sliceBlock, evalBlock, stripJs, AGENT_INDEX, BOT_INDEX } from './_source-slice.js';

const agent = readSource(AGENT_INDEX);
const shape = Number(stripJs(agent).match(/const MOB_PACK_SHAPE = (\d+);/)?.[1]);
const botVersion = Number(stripJs(readSource(BOT_INDEX)).match(/const _MOB_PACK_VERSION = (\d+);/)?.[1]);

const { _mobPackDue } = evalBlock(
  'const MOB_PACK_REVALIDATE_MS = 24 * 60 * 60 * 1000;\nconst MOB_PACK_SHAPE = ' + shape + ';\n' +
  sliceBlock(agent, 'function _mobPackDue(e, now) {', '\n}\n'), ['_mobPackDue']);

describe('mob pack shape', () => {
  it("the agent's expected shape is the bot's pack version", () => {
    expect(shape).toBeGreaterThan(0);
    expect(shape).toBe(botVersion);
  });
  it('a pack fetched an hour ago under the current shape is not due', () => {
    const now = Date.now();
    expect(_mobPackDue({ bytes: 10, fetchedAt: now - 3600e3, shape }, now)).toBe(false);
  });
  it('a pack fetched an hour ago with no shape, or an older one, is due at once', () => {
    const now = Date.now();
    expect(_mobPackDue({ bytes: 10, fetchedAt: now - 3600e3 }, now)).toBe(true);
    expect(_mobPackDue({ bytes: 10, fetchedAt: now - 3600e3, shape: shape - 1 }, now)).toBe(true);
  });
  it('a back-off still wins, so a failing bot is not hammered', () => {
    const now = Date.now();
    expect(_mobPackDue({ bytes: 10, fetchedAt: now - 3600e3, retryAt: now + 60e3 }, now)).toBe(false);
  });
});
