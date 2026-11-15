// test/agent-combat-detail.test.js — per-fight combat detail the agent uploads in rollup.by_char.
//
// 1. by_skill[ability] carries { hits, dmg } plus the largest hit (`max`), the smallest non-zero hit
//    (`min`) and, with 2+ hits, `h`: a 16-bucket log2 histogram the web reads with histQuantile.
// 2. A Shadow Knight's own Harm Touch (landing line + the uploader's own non-melee hit line, either order)
//    is credited to by_skill['harm touch'] instead of 'hit', and pushes the harm_touch fun-event.
//    A Paladin's Lay on Hands landing on their target is counted (by_skill['lay on hands'].hits).
// 3. by_char[uploader].weave: rounds, roundsWithSpecial, specials, avgRoundGapMs, lateRounds.
//
// Landing wording is from eqemu_spells (verified). The pairing with the damage line is INFERRED (no live
// log yet) — these tests pin the behaviour, not the server.
//
// Run: npx vitest run test/agent-combat-detail.test.js

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const agent = require('../packages/wolfpack-logsync/index.js');

const BOSS = 'Lord of Ire';
const stamp = (sec) => {
  const mm = String(40 + Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `[Sun Sep 13 20:${mm}:${ss} 2026] `;
};

// Same intake the live tail uses: shouldKeep -> parseEvent -> builder.add.
function feed(b, sec, text) {
  const line = stamp(sec) + text;
  if (!agent.shouldKeep(line)) return null;
  const ev = agent.parseEvent(line, agent.parseEqTimestamp(line));
  if (ev) b.add(ev);
  return ev;
}

// A builder whose fight is long enough to flush (10+ events), plus the payloads it flushed.
function builder(character, { silent = false } = {}) {
  const out = [];
  const b = new agent.EncounterBuilder({ character, silent, onFlush: p => out.push(p) });
  return { b, out };
}
const padFight = (b, from, n = 10, who = 'You', verb = 'slash') => {
  for (let i = 0; i < n; i++) feed(b, from + i * 2, `${who} ${verb} ${BOSS} for ${200 + i} points of damage.`);
};
const rollupOf = (out, name) => out[0].encounter.rollup.by_char[name];

beforeEach(() => { agent.funEventBuffer.length = 0; });

describe('histQuantile', () => {
  const h = new Array(16).fill(0);
  h[6] = 1; h[7] = 2; h[11] = 1;           // hits of 90, 250, 250, 4000

  it('reads the ends exactly from min / max', () => {
    expect(agent.histQuantile(h, 0, 90, 4000)).toBe(90);
    expect(agent.histQuantile(h, 1, 90, 4000)).toBe(4000);
  });
  it('is monotonic and stays inside [min, max]', () => {
    const p25 = agent.histQuantile(h, 0.25, 90, 4000);
    const p50 = agent.histQuantile(h, 0.5, 90, 4000);
    const p75 = agent.histQuantile(h, 0.75, 90, 4000);
    expect(p25).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p75);
    expect(p25).toBeGreaterThanOrEqual(90);
    expect(p75).toBeLessThanOrEqual(4000);
    // the median sits in the 128..255 bucket where two of the four hits are
    expect(p50).toBeGreaterThanOrEqual(128);
    expect(p50).toBeLessThan(256);
  });
  it('is exact for a flat run (min = max)', () => {
    const f = new Array(16).fill(0); f[8] = 5;      // five hits of 300
    expect(agent.histQuantile(f, 0.5, 300, 300)).toBe(300);
  });
  it('is null for no data', () => {
    expect(agent.histQuantile(new Array(16).fill(0), 0.5)).toBeNull();
    expect(agent.histQuantile(undefined, 0.5)).toBeNull();
  });
  it('lands within a factor of 1.5 of the true median on a spread sample', () => {
    const sample = [];
    for (let i = 0; i < 200; i++) sample.push(Math.round(100 * Math.pow(30, i / 199)));   // 100..3000, log-spread
    const { b, out } = builder('Aldenmar', { silent: true });
    sample.forEach((n, i) => feed(b, i, `You hit ${BOSS} for ${n} points of damage.`));
    b.flush();
    const s = rollupOf(out, 'Aldenmar').by_skill.hit;
    const sorted = [...sample].sort((x, y) => x - y);
    const truth = sorted[100];
    const est = agent.histQuantile(s.h, 0.5, s.min, s.max);
    expect(est / truth).toBeGreaterThan(1 / 1.5);
    expect(est / truth).toBeLessThan(1.5);
  });
});

describe('by_skill highs / mids / lows', () => {
  function run() {
    const { b, out } = builder('Aldenmar', { silent: true });
    let t = 0;
    for (const n of [250, 4000, 90, 250]) feed(b, t++, `You kick ${BOSS} for ${n} points of damage.`);
    feed(b, t++, `You eagle strike ${BOSS} for 700 points of damage.`);   // a single hit
    padFight(b, t);
    b.flush();
    return rollupOf(out, 'Aldenmar');
  }

  it('adds max, min and the histogram per ability', () => {
    const k = run().by_skill.kick;
    expect(k.hits).toBe(4);
    expect(k.dmg).toBe(4590);
    expect(k.max).toBe(4000);
    expect(k.min).toBe(90);
    expect(k.h).toHaveLength(16);
    expect(k.h[6]).toBe(1);      // 90   in [64,128)
    expect(k.h[7]).toBe(2);      // 250  in [128,256)
    expect(k.h[11]).toBe(1);     // 4000 in [2048,4096)
    expect(k.h.reduce((a, c) => a + c, 0)).toBe(4);
  });
  it('leaves the histogram off a one-hit ability', () => {
    const e = run().by_skill['eagle strike'];
    expect(e).toEqual({ hits: 1, dmg: 700, max: 700, min: 700 });
  });
  it('keeps total_hits and total_damage as they were', () => {
    const r = run();
    expect(r.total_hits).toBe(15);
    expect(r.total_damage).toBe(4590 + 700 + [...Array(10).keys()].reduce((a, i) => a + 200 + i, 0));
  });
  it('puts a hit of 1 in bucket 0 and 8192..16383 in bucket 13', () => {
    const { b, out } = builder('Aldenmar', { silent: true });
    feed(b, 0, `Aldenmar hit ${BOSS} for 1 points of non-melee damage.`);
    feed(b, 1, `Aldenmar hit ${BOSS} for 14000 points of non-melee damage.`);
    padFight(b, 2, 10, 'Aldenmar');
    b.flush();
    const s = rollupOf(out, 'Aldenmar').by_skill.hit;
    expect(s.h[0]).toBe(1);
    expect(s.h[13]).toBe(1);
    expect(s.min).toBe(1);
    expect(s.max).toBe(14000);
  });
});

describe('Harm Touch', () => {
  const sk = (name) => agent.whoData.set(name.toLowerCase(), { name, class: 'Shadow Knight', classSource: 'who' });

  it('parses the verified landing lines into ability_land and keeps them', () => {
    const a = stamp(0) + `${BOSS} writhes in the grip of agony.`;
    expect(agent.shouldKeep(a)).toBe(true);
    expect(agent.parseEvent(a, agent.parseEqTimestamp(a))).toMatchObject({ type: 'ability_land', kind: 'harm_touch', target: BOSS });
    const y = stamp(0) + 'You writhe in the grip of agony.';
    expect(agent.parseEvent(y, agent.parseEqTimestamp(y))).toMatchObject({ type: 'ability_land', kind: 'harm_touch', target: null });
    const l = stamp(0) + 'Corvale feels a healing touch.';
    expect(agent.parseEvent(l, agent.parseEqTimestamp(l))).toMatchObject({ type: 'ability_land', kind: 'lay_on_hands', target: 'Corvale' });
  });
  it('flags the caster-side spell hit as nonMelee', () => {
    const l = stamp(0) + `You hit ${BOSS} for 1200 points of non-melee damage.`;
    expect(agent.parseEvent(l, agent.parseEqTimestamp(l)).nonMelee).toBe(true);
    const m = stamp(0) + `You hit ${BOSS} for 1200 points of damage.`;
    expect(agent.parseEvent(m, agent.parseEqTimestamp(m)).nonMelee).toBeUndefined();
  });

  it('credits landing-then-damage to harm touch and emits the fun event', () => {
    sk('Brackwyn');
    const { b, out } = builder('Brackwyn');
    padFight(b, 0, 5);
    feed(b, 11, `${BOSS} writhes in the grip of agony.`);
    feed(b, 11, `You hit ${BOSS} for 1200 points of non-melee damage.`);
    padFight(b, 12, 5);
    b.flush();
    const r = rollupOf(out, 'Brackwyn');
    expect(r.by_skill['harm touch']).toMatchObject({ hits: 1, dmg: 1200, max: 1200, min: 1200 });
    expect(r.by_skill.hit).toBeUndefined();
    expect(agent.funEventBuffer.filter(e => e.type === 'harm_touch')).toEqual([
      expect.objectContaining({ type: 'harm_touch', caster: 'Brackwyn', reagent_qty: 1200 }),
    ]);
  });
  it('credits damage-then-landing too', () => {
    sk('Brackwyn');
    const { b, out } = builder('Brackwyn', { silent: true });
    padFight(b, 0, 5);
    feed(b, 11, `You hit ${BOSS} for 1200 points of non-melee damage.`);
    feed(b, 11, `${BOSS} writhes in the grip of agony.`);
    padFight(b, 12, 5);
    b.flush();
    expect(rollupOf(out, 'Brackwyn').by_skill['harm touch']).toMatchObject({ hits: 1, dmg: 1200 });
  });
  it('does not credit a bystander landing (no own spell-hit line follows)', () => {
    sk('Brackwyn');
    const { b, out } = builder('Brackwyn', { silent: true });
    padFight(b, 0, 5);
    feed(b, 11, `${BOSS} writhes in the grip of agony.`);
    feed(b, 20, `You hit ${BOSS} for 900 points of non-melee damage.`);   // 9 s later: an unrelated nuke
    padFight(b, 22, 5);
    b.flush();
    const r = rollupOf(out, 'Brackwyn');
    expect(r.by_skill['harm touch']).toBeUndefined();
    expect(r.by_skill.hit.max).toBe(900);
  });
  it('does not pair a landing with an own spell hit from long before it', () => {
    sk('Brackwyn');
    const { b, out } = builder('Brackwyn', { silent: true });
    padFight(b, 0, 3);
    feed(b, 8, `You hit ${BOSS} for 900 points of non-melee damage.`);
    feed(b, 15, `${BOSS} writhes in the grip of agony.`);      // 7 s after: not the same tick
    padFight(b, 16, 6);
    b.flush();
    const r = rollupOf(out, 'Brackwyn');
    expect(r.by_skill['harm touch']).toBeUndefined();
    expect(r.by_skill.hit.max).toBe(900);
  });
  it('does not credit a hit on a different target', () => {
    sk('Brackwyn');
    const { b, out } = builder('Brackwyn', { silent: true });
    padFight(b, 0, 5);
    feed(b, 11, `${BOSS} writhes in the grip of agony.`);
    feed(b, 11, 'You hit a lava giant for 900 points of non-melee damage.');
    padFight(b, 12, 5);
    b.flush();
    expect(rollupOf(out, 'Brackwyn').by_skill['harm touch']).toBeUndefined();
  });
  it('does nothing when the uploader is not a Shadow Knight', () => {
    agent.whoData.set('corvale', { name: 'Corvale', class: 'Wizard', classSource: 'who' });
    const { b, out } = builder('Corvale');
    padFight(b, 0, 5);
    feed(b, 11, `${BOSS} writhes in the grip of agony.`);
    feed(b, 11, `You hit ${BOSS} for 1200 points of non-melee damage.`);
    padFight(b, 12, 5);
    b.flush();
    const r = rollupOf(out, 'Corvale');
    expect(r.by_skill['harm touch']).toBeUndefined();
    expect(r.by_skill.hit.max).toBe(1200);
    expect(agent.funEventBuffer.filter(e => e.type === 'harm_touch')).toHaveLength(0);
  });
  it('a silent (backfill) builder pairs but does not announce', () => {
    sk('Brackwyn');
    const { b, out } = builder('Brackwyn', { silent: true });
    padFight(b, 0, 5);
    feed(b, 11, `${BOSS} writhes in the grip of agony.`);
    feed(b, 11, `You hit ${BOSS} for 1200 points of non-melee damage.`);
    padFight(b, 12, 5);
    b.flush();
    expect(rollupOf(out, 'Brackwyn').by_skill['harm touch'].hits).toBe(1);
    expect(agent.funEventBuffer).toHaveLength(0);
  });
});

describe('Lay on Hands', () => {
  it('counts a landing on the Paladin\'s target, with no heal amount', () => {
    agent.whoData.set('corvale', { name: 'Corvale', class: 'Paladin', classSource: 'who' });
    agent._setZealStateForTest('Corvale', { target_name: 'Aldenmar' });
    try {
      const { b, out } = builder('Corvale');
      padFight(b, 0, 5);
      feed(b, 11, 'Aldenmar feels a healing touch.');
      feed(b, 20, 'Brackwyn feels a healing touch.');           // not the target: not ours
      padFight(b, 22, 5);
      b.flush();
      const r = rollupOf(out, 'Corvale');
      expect(r.by_skill['lay on hands']).toEqual({ hits: 1, dmg: 0 });
      expect(r.total_hits).toBe(10);                            // the count is not a damage hit
      expect(agent.funEventBuffer.filter(e => e.type === 'lay_on_hands')).toEqual([
        expect.objectContaining({ caster: 'Corvale', reagent_qty: 0 }),
      ]);
    } finally {
      agent._setZealStateForTest('Corvale', null);
    }
  });
  it('ignores the landing when the uploader is not a Paladin', () => {
    agent.whoData.set('corvale', { name: 'Corvale', class: 'Cleric', classSource: 'who' });
    agent._setZealStateForTest('Corvale', { target_name: 'Aldenmar' });
    try {
      const { b, out } = builder('Corvale', { silent: true });
      padFight(b, 0, 5);
      feed(b, 11, 'Aldenmar feels a healing touch.');
      padFight(b, 12, 5);
      b.flush();
      expect(rollupOf(out, 'Corvale').by_skill['lay on hands']).toBeUndefined();
    } finally {
      agent._setZealStateForTest('Corvale', null);
    }
  });
});

describe('monk weave', () => {
  // Rounds (punch + punch in one second) every 2 s at 0,2,4,6,8,10, a special after rounds 0, 4 and 10, and
  // the next round after the last special 6 s late (16).
  function run(extra) {
    const { b, out } = builder('Aldenmar', { silent: true });
    const round = (s) => { feed(b, s, `You punch ${BOSS} for 120 points of damage.`); feed(b, s, `You punch ${BOSS} for 110 points of damage.`); };
    round(0); feed(b, 1, `You flying kick ${BOSS} for 400 points of damage.`);
    round(2);
    round(4); feed(b, 5, `You round kick ${BOSS} for 380 points of damage.`);
    round(6); round(8);
    round(10); feed(b, 11, `You eagle strike ${BOSS} for 300 points of damage.`);
    round(16);
    if (extra) extra(b, round);
    b.flush();
    return rollupOf(out, 'Aldenmar');
  }

  it('counts rounds, specials and the late round after a clip', () => {
    expect(run().weave).toEqual({ rounds: 7, roundsWithSpecial: 3, specials: 3, avgRoundGapMs: 2667, lateRounds: 1 });
  });
  it('does not call an ordinary one-second jitter late', () => {
    // the round after the special is 3 s on a 2 s median: log-second noise, not a clip
    const { b, out } = builder('Aldenmar', { silent: true });
    const round = (s) => { feed(b, s, `You punch ${BOSS} for 120 points of damage.`); feed(b, s, `You punch ${BOSS} for 110 points of damage.`); };
    for (const s of [0, 2, 4, 6, 8]) round(s);
    feed(b, 9, `You flying kick ${BOSS} for 400 points of damage.`);
    round(11);
    round(13);
    b.flush();
    const w = rollupOf(out, 'Aldenmar').weave;
    expect(w.specials).toBe(1);
    expect(w.lateRounds).toBe(0);
  });
  it('counts a missed swing as a round and keeps weave off a fight with no special', () => {
    const { b, out } = builder('Aldenmar', { silent: true });
    for (let i = 0; i < 14; i++) feed(b, i * 2, i % 2 ? `You try to punch ${BOSS}, but miss!` : `You punch ${BOSS} for 100 points of damage.`);
    b.flush();
    expect(rollupOf(out, 'Aldenmar').weave).toBeUndefined();
    // the same swings with a kick after the first round: the missed rounds still count as rounds
    const m = builder('Aldenmar', { silent: true });
    for (let i = 0; i < 14; i++) {
      feed(m.b, i * 2, i % 2 ? `You try to punch ${BOSS}, but miss!` : `You punch ${BOSS} for 100 points of damage.`);
      if (i === 0) feed(m.b, 1, `You kick ${BOSS} for 150 points of damage.`);
    }
    m.b.flush();
    expect(rollupOf(m.out, 'Aldenmar').weave).toMatchObject({ rounds: 14, specials: 1, roundsWithSpecial: 1 });
  });
  it('ignores other characters\' swings', () => {
    const w = run((b) => { for (let s = 20; s < 40; s += 2) feed(b, s, `Brackwyn kicks ${BOSS} for 90 points of damage.`); }).weave;
    expect(w.rounds).toBe(7);
    expect(w.specials).toBe(3);
  });
});
