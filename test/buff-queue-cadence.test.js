// The buff queue checks often only when something matters (the guild lead, 2026-11-17, DECISIONS §617): "We don't need to
// check those that often. We're more concerned with when things change… when someone's health is fluxuating that's a sign
// we need to pay attention to them." Idle: every 6 s, and an unchanged answer is a 304. Fast (2 s) for 20 s after a raider's
// HP drops 10 points or more, your own death or rez, or a dispel.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { readSource, stripJs, sliceBlock, AGENT_INDEX } from './_source-slice.js';

let agent;
beforeAll(() => { agent = createRequire(import.meta.url)('../packages/wolfpack-logsync/index.js'); });

describe('buff queue cadence', () => {
  it('idles at 6 s, and goes to 2 s for 20 s after something that matters', () => {
    agent._resetBuffQueueFastForTest();
    const now = Date.now();
    expect(agent._buffQueueTtl(now)).toBe(6000);
    agent._buffQueueFast(now);
    expect(agent._buffQueueTtl(now + 1000)).toBe(2000);
    expect(agent._buffQueueTtl(now + 21_000)).toBe(6000);
  });

  it('a raider dropping 10 points of health between pipe fires opens the fast window; a 3-point wobble does not', () => {
    // The raid pipe sends other members' health as hp_current / hp_max = percent / 100.
    const fire = (hp) => agent._maybeUploadRaidRoster({ data: JSON.stringify([{ name: 'Aldenmar', class: 'Warrior', group: 1, level: 60, rank: 'Member', hp_current: hp, hp_max: 100 }]) });
    agent._setRaidPipeForTest(null);
    agent._resetBuffQueueFastForTest();
    fire(95); fire(92);
    expect(agent._buffQueueTtl(Date.now() + 1000)).toBe(6000);   // a wobble: still idle
    fire(70);
    expect(agent._buffQueueTtl(Date.now() + 1000)).toBe(2000);   // a real drop: fast
  });

  it('sends If-None-Match from the cached copy and treats a 304 as "still current"', () => {
    const src = stripJs(sliceBlock(readSource(AGENT_INDEX), 'function fetchRaidBuffQueue(bufferClass, bufferCharacter) {', '\n}'));
    expect(src).toMatch(/'If-None-Match': cached\.etag/);
    expect(src).toMatch(/res\.statusCode === 304 && cached\) \{ cached\.at = Date\.now\(\); return; \}/);
    expect(src).toMatch(/etag: res\.statusCode === 200 \? \(res\.headers\.etag \|\| null\) : null/);
  });
});
