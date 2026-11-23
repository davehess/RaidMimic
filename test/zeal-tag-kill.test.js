// The main assist's KILL tag (2026-11-17). A member explained Zeal's /tag prefixes in the guild's raid channel: "+ does
// 'Add this TAG to my current target, but don't remove any of its existing tags' ... @ does 'Add this TAG to my current
// target, but don't remove any of its existing tags. Also remove specifically this TAG from other targets in the zone'".
// The kill macro is `/tag rsgs @^r^KILL`. The guild lead: "consume this for targetting".
// Runs the real agent: the tag broadcast as Zeal sends it, then the KILL target it yields.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { readSource, sliceBlock, stripJs, AGENT_INDEX } from './_source-slice.js';

let agent;
beforeAll(() => { agent = createRequire(import.meta.url)('../packages/wolfpack-logsync/index.js'); });
beforeEach(() => agent._zealTagsForTest.clear());

const T0 = Date.now();
const tagMsg = (text, mob, id) => `ZEALTAG | ${text} | ${mob} | ${id}`;

describe('the KILL tag', () => {
  it('reads @^r^KILL as KILL with a red shape, not as the literal text', () => {
    agent._applyZealTagMessage(tagMsg('@^r^KILL', 'Diaku Armsman', 371), 'Aldenmar', T0);
    const t = agent._zealTagsForTest.get(371);
    expect(t.text).toBe('KILL');
    expect(t.shape).toBe('R');
  });

  it('@ is exclusive: a new KILL takes it off the old target, which keeps its arrow but no text', () => {
    agent._applyZealTagMessage(tagMsg('@^r^KILL', 'Diaku Armsman', 371), 'Aldenmar', T0);
    agent._applyZealTagMessage(tagMsg('@^r^KILL', 'a Diaku Warrior', 714), 'Aldenmar', T0 + 5000);
    expect(agent._zealTagsForTest.get(371).text).toBe('');
    expect(agent._zealTagsForTest.get(371).shape).toBe('R');
    expect(agent._zealTagsForTest.get(714).text).toBe('KILL');
    expect(agent._killTagNow(T0 + 6000).spawn_id).toBe(714);
  });

  it('+ is not exclusive: both mobs keep KILL, and the newest one is the KILL target', () => {
    agent._applyZealTagMessage(tagMsg('+KILL', 'Diaku Armsman', 371), 'Aldenmar', T0);
    agent._applyZealTagMessage(tagMsg('+KILL', 'a Diaku Warrior', 714), 'Aldenmar', T0 + 5000);
    expect(agent._zealTagsForTest.get(371).text).toBe('KILL');
    expect(agent._killTagNow(T0 + 6000).spawn_id).toBe(714);
  });

  it('@ only clears the same text: a SLOW tag on another mob stays', () => {
    agent._applyZealTagMessage(tagMsg('+SLOW', 'Diaku Armsman', 371), 'Brackwyn', T0);
    agent._applyZealTagMessage(tagMsg('@^r^KILL', 'a Diaku Warrior', 714), 'Aldenmar', T0 + 1000);
    expect(agent._zealTagsForTest.get(371).text).toBe('SLOW');
  });

  it('a colour code mid-text is dropped too', () => {
    agent._applyZealTagMessage(tagMsg('^r^KILL ^g^NOW', 'Diaku Armsman', 371), 'Aldenmar', T0);
    expect(agent._zealTagsForTest.get(371).text).toBe('KILL NOW');
  });

  it('an old KILL (past the 10-minute tag window) is no KILL target', () => {
    agent._applyZealTagMessage(tagMsg('@^r^KILL', 'Diaku Armsman', 371), 'Aldenmar', T0);
    expect(agent._killTagNow(T0 + 11 * 60_000)).toBeNull();
  });

  it('the main target prefers the KILL tag while its mob is a live row, before "most targeted"', () => {
    const fn = stripJs(sliceBlock(readSource(AGENT_INDEX), 'function _resolveMainTarget(activeCharacter) {', '\n}'));
    const kill = fn.indexOf('_killTagNow()'), most = fn.indexOf('raider_count || 0) < 1');
    expect(kill).toBeGreaterThan(-1);
    expect(most).toBeGreaterThan(kill);
    expect(fn).toMatch(/source: 'kill_tag'/);
  });
});
