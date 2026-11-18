// raid-buff-queue: answer only when something changed, and rebuff the dead first (the guild lead, 2026-11-17, DECISIONS §617):
// "We don't need to check those that often. We're more concerned with when things change." / "when someone died they need
// to be rebuffed. that's a priority."
// The queue was ~45% of the bot's raid-night egress: >30 KB to every raider every 2 s, changed or not.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { BOT_INDEX, readSource, sliceBlock, stripJs } from './_source-slice.js';

const src = readSource(BOT_INDEX);
const req = createRequire(import.meta.url);

const etagBlock = sliceBlock(src, 'function _rbqEtag(out, now = Date.now()) {', '\n}');
// eslint-disable-next-line no-new-func
const { _rbqEtag } = new Function('require', `${etagBlock}\nreturn { _rbqEtag };`)(req);

const deathBlock = sliceBlock(src, 'const _lastRaiderDeath = new Map();', '\n}');   // through _rebuffAfterDeath
// eslint-disable-next-line no-new-func
const death = new Function(`${deathBlock}\nreturn { _lastRaiderDeath, _rebuffAfterDeath };`)();

const T = 1_800_000_000_000;   // a fixed minute boundary
const base = () => ({
  buff_queue: [{ name: 'Aldenmar', tier: 'yellow', missing: ['Haste'], casting: [{ caster: 'Brackwyn', spell: 'Swift like the Wind', remaining_secs: 5 }] }],
  debuff_queue: [{ name: 'Corvale', curses: [{ name: 'Gravel Rain', remaining_secs: 40 }] }],
  roster: [{ name: 'Aldenmar', hp_pct: 93, buffs: [{ n: 'Aegolism', t: 200 }], detail: { hp: [{ n: 'Aegolism', s: 1200 }] } }],
});

describe('raid-buff-queue ETag', () => {
  it('ignores countdowns and a cast ticking down', () => {
    const a = base();
    const b = base();
    b.roster[0].buffs[0].t = 150;
    b.roster[0].detail.hp[0].s = 900;
    b.debuff_queue[0].curses[0].remaining_secs = 12;
    b.buff_queue[0].casting[0].remaining_secs = 1;
    expect(_rbqEtag(a, T)).toBe(_rbqEtag(b, T));
  });

  it('changes when HP moves a 10% step, not on a 1-point wobble', () => {
    const a = base();
    const wobble = base(); wobble.roster[0].hp_pct = 94;
    const drop = base(); drop.roster[0].hp_pct = 60;
    expect(_rbqEtag(wobble, T)).toBe(_rbqEtag(a, T));
    expect(_rbqEtag(drop, T)).not.toBe(_rbqEtag(a, T));
  });

  it('changes when a buff lands or fades, or a new cast starts', () => {
    const a = base();
    const landed = base(); landed.roster[0].buffs.push({ n: 'Haste', t: 100 });
    const faded = base(); faded.buff_queue[0].missing = ['Haste', 'HP'];
    const cast = base(); cast.buff_queue[0].casting.push({ caster: 'Nyssara', spell: 'Aegolism', remaining_secs: 9 });
    for (const x of [landed, faded, cast]) expect(_rbqEtag(x, T)).not.toBe(_rbqEtag(a, T));
  });

  it('turns over each minute, so countdowns are never more than a minute stale', () => {
    expect(_rbqEtag(base(), T + 59_000)).toBe(_rbqEtag(base(), T));
    expect(_rbqEtag(base(), T + 60_000)).not.toBe(_rbqEtag(base(), T));
  });

  it('the handler answers 304 on a matching If-None-Match and sends the tag with the body', () => {
    const h = stripJs(sliceBlock(src, 'async function _handleAgentRaidBuffQueue(req, res) {', '\n}'));
    expect(h).toMatch(/\(req\.headers \|\| \{\}\)\['if-none-match'\] === etag/);
    expect(h).toMatch(/res\.writeHead\(304/);
    expect(h).toMatch(/sendJson\(req, res, 200, JSON\.stringify\(out\), \{ 'ETag': etag \}\)/);
  });
});

describe('rebuff after death', () => {
  it('flags a raider who died in the last 30 minutes and is still nearly bare', () => {
    death._lastRaiderDeath.set('aldenmar', T - 5 * 60_000);
    expect(death._rebuffAfterDeath('Aldenmar', 0, T)).toBe(true);
    expect(death._rebuffAfterDeath('Aldenmar', 3, T)).toBe(false);                 // rebuffed already
    expect(death._rebuffAfterDeath('Aldenmar', 0, T + 31 * 60_000)).toBe(false);   // too long ago
    expect(death._rebuffAfterDeath('Brackwyn', 0, T)).toBe(false);                 // never died
  });

  it('sorts right after same-zone, ahead of tank HP gaps', () => {
    const h = stripJs(sliceBlock(src, 'async function _handleAgentRaidBuffQueue(req, res) {', '\n}'));
    const i = h.indexOf('buffQueue.sort(');
    const sortText = h.slice(i, h.indexOf('a.name.localeCompare(b.name))', i));
    const zone = sortText.indexOf('same_zone');
    const dead = sortText.indexOf('rebuff_after_death');
    const tank = sortText.indexOf('needs_tank_hp');
    expect(zone).toBeGreaterThan(-1);
    expect(dead).toBeGreaterThan(zone);
    expect(tank).toBeGreaterThan(dead);
    expect(h).toMatch(/rebuff_after_death:\s+_rebuffAfterDeath\(name, totalBuffs\)/);
  });
});
