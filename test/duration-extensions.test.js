// test/duration-extensions.test.js — how long a spell WE cast really lasts, and the timers the party shares.
//
// The chain under test is the server's (SecretsOTheP/EQMacEmu c2cd265): Mob::CalcBuffDuration zone/spells.cpp:2452-2525
// (formula, then Spell Casting Reinforcement for a client caster on a BENEFICIAL spell), then Client::ApplyDurationFocus
// zone/spell_effects.cpp:4630-4662 (the best worn SPA 128 item that passes CalcFocusEffect's limits, :4080-4408; none for a
// bard song, :4433). Every expected number below is worked by hand from those lines, in integer arithmetic, not copied from the
// code under test. The mutation checks are recorded in docs/STATUS.md.
// Run: npx vitest run test/duration-extensions.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const agent = require('../packages/wolfpack-logsync/index.js');

// Formula 10 (level*3+10) with a cap far above it: at L60 the formula gives 190 ticks. Beneficial = good 1.
const BUFF   = { name: 'Aldenmar Test Buff', durf: 10, dur: 2000, good: 1 };
const DEBUFF = { name: 'Aldenmar Test Debuff', durf: 10, dur: 2000, good: 0 };
const SHORT  = { name: 'Aldenmar Short Buff', durf: 3, dur: 5, good: 1 };            // 5 ticks at any level
const CHARM  = { name: 'Aldenmar Test Charm', durf: 3, dur: 360, good: 0 };           // formula 3: level*30, capped at 360 ticks
const PERM   = { name: 'Aldenmar Perm', durf: 50, dur: 0, good: 1 };
const aa = (r, m) => [...(r ? [{ index: 21, rank: r }] : []), ...(m ? [{ index: 113, rank: m }] : [])];
// An item's focus row as the bot sends it (view item_duration_focus).
const focus = (id, pct, o = {}) => ({ id, spell: 1, pct, max_level: 65, type_limit: 1, min_ticks: 8, ...o });
const dur = (spell, { aas = null, worn = [], level = 60, song = false, spellLevel = 0 } = {}) =>
  agent._durationWithExtensions(spell, level, { kit: { aas, worn, classId: null }, song, spellLevel });

beforeEach(() => agent._setDurationFociCatalog([focus(9001, 15), focus(9002, 20), focus(9003, 25)]));

describe('Spell Casting Reinforcement (spells.cpp:2479-2515)', () => {
  it('no AAs: the bare formula, 190 ticks at level 60', () => {
    const r = dur(BUFF, { aas: [{ index: 5, rank: 1 }] });
    expect(r.ticks).toBe(190); expect(r.aa_pct).toBe(0); expect(r.estimated).toBe(false);
  });
  it('rank 1 / 2 / 3 add 5 / 15 / 30 percent, truncated like the server\'s integer res * bonus / 100', () => {
    expect(dur(BUFF, { aas: aa(1) }).ticks).toBe(190 + 9);     // 9.5 -> 9
    expect(dur(BUFF, { aas: aa(2) }).ticks).toBe(190 + 28);    // 28.5 -> 28
    expect(dur(BUFF, { aas: aa(3) }).ticks).toBe(190 + 57);
  });
  it('Reinforcement Mastery adds 20 points on top of a held rank', () => {
    expect(dur(BUFF, { aas: aa(1, 1) }).ticks).toBe(190 + 47);   // 25% = 47.5 -> 47
    expect(dur(BUFF, { aas: aa(3, 1) }).ticks).toBe(190 + 95);   // 50%
  });
  it('Mastery alone adds nothing: the server checks it inside rank > 0', () => {
    expect(dur(BUFF, { aas: aa(0, 1) }).ticks).toBe(190);
  });
  it('a rank above 3 adds nothing from the rank (the switch default) but Mastery still adds its 20', () => {
    expect(dur(BUFF, { aas: aa(4) }).ticks).toBe(190);
    expect(dur(BUFF, { aas: aa(4, 1) }).ticks).toBe(190 + 38);
  });
  it('reads the CLIENT indexes 21 / 113, not skill ids 86 / 266', () => {
    expect(agent._reinforcementPct([{ index: 86, rank: 3 }, { index: 266, rank: 1 }])).toBe(0);
    expect(agent._reinforcementPct([{ index: 21, rank: 3 }, { index: 113, rank: 1 }])).toBe(50);
  });
  it('a detrimental spell gets no Reinforcement', () => {
    const r = dur(DEBUFF, { aas: aa(3, 1) });
    expect(r.ticks).toBe(190); expect(r.aa_pct).toBe(0);
  });
  it('a permanent spell (formula 50) is left alone', () => {
    expect(dur(PERM, { aas: aa(3, 1), worn: [9003] }).ticks).toBe(72000);
  });
});

describe('item duration focus (ApplyDurationFocus + CalcFocusEffect)', () => {
  it('15 / 20 / 25 percent: floor(ticks * (100 + focus) / 100)', () => {
    expect(dur(BUFF, { worn: [9001] }).ticks).toBe(218);   // 190*115/100 = 218.5
    expect(dur(BUFF, { worn: [9002] }).ticks).toBe(228);
    expect(dur(BUFF, { worn: [9003] }).ticks).toBe(237);   // 237.5
  });
  it('only the best single worn item counts, they do not add', () => {
    const r = dur(BUFF, { worn: [9003, 9001, 9002] });   // the best is not last: order must not decide
    expect(r.ticks).toBe(237); expect(r.focus_pct).toBe(25); expect(r.focus_item).toBe(9003);
  });
  it('applies AFTER Reinforcement: 190 + 57 = 247, then x1.15 = 284', () => {
    expect(dur(BUFF, { aas: aa(3), worn: [9001] }).ticks).toBe(284);
  });
  it('SE_LimitMaxLevel 134: a spell above the cap gets nothing, at or below gets it', () => {
    agent._setDurationFociCatalog([focus(9010, 15, { max_level: 49 })]);
    expect(dur(BUFF, { worn: [9010], spellLevel: 50 }).focus_pct).toBe(0);
    expect(dur(BUFF, { worn: [9010], spellLevel: 49 }).focus_pct).toBe(15);
    expect(dur(BUFF, { worn: [9010], spellLevel: 44 }).ticks).toBe(218);
  });
  it('a cap of 65 passes any spell, even with the spell\'s level unknown', () => {
    const r = dur(BUFF, { aas: aa(0), worn: [9001] });
    expect(r.focus_pct).toBe(15); expect(r.estimated).toBe(false);
  });
  it('a low cap with the spell level unknown is NOT applied and the answer is marked estimated', () => {
    agent._setDurationFociCatalog([focus(9010, 15, { max_level: 49 })]);
    const r = dur(BUFF, { aas: aa(0), worn: [9010] });
    expect(r.ticks).toBe(190); expect(r.estimated).toBe(true);
  });
  it('SE_LimitSpellType 138: 1 = beneficial only, 0 = detrimental only, none = both', () => {
    agent._setDurationFociCatalog([focus(9020, 15, { type_limit: 1 }), focus(9021, 20, { type_limit: 0 }), focus(9022, 25, { type_limit: null })]);
    expect(dur(BUFF, { worn: [9020] }).focus_pct).toBe(15);
    expect(dur(DEBUFF, { worn: [9020] }).focus_pct).toBe(0);
    expect(dur(BUFF, { worn: [9021] }).focus_pct).toBe(0);
    expect(dur(DEBUFF, { worn: [9021] }).focus_pct).toBe(20);
    expect(dur(BUFF, { worn: [9022] }).focus_pct).toBe(25);
    expect(dur(DEBUFF, { worn: [9022] }).focus_pct).toBe(25);
  });
  it('SE_LimitMinDur 140: the spell\'s own formula duration must reach the minimum', () => {
    expect(dur(SHORT, { worn: [9001] }).ticks).toBe(5);                      // 5 ticks < 8
    agent._setDurationFociCatalog([focus(9030, 15, { min_ticks: 4 })]);
    expect(dur(SHORT, { worn: [9030] }).ticks).toBe(5);                      // 5 >= 4: floor(5*115/100) = 5
    expect(dur(BUFF, { worn: [9030] }).ticks).toBe(218);
  });
  it('the minimum is judged on the formula duration, BEFORE Reinforcement lengthens it', () => {
    agent._setDurationFociCatalog([focus(9031, 15, { min_ticks: 6 })]);
    // 5 ticks + 30% = 6 would pass the minimum if the AA were counted; the server compares the plain formula (spell_effects.cpp:4165)
    expect(dur(SHORT, { aas: aa(3), worn: [9031] }).focus_pct).toBe(0);
  });
  it('a bard song gets no focus (GetFocusEffect :4433) but still gets Reinforcement', () => {
    const r = dur(BUFF, { aas: aa(3), worn: [9003], song: true });
    expect(r.ticks).toBe(247); expect(r.focus_pct).toBe(0);
  });
});

describe('charm', () => {
  it('no Reinforcement, even with every AA: charm is detrimental', () => {
    expect(dur(CHARM, { aas: aa(3, 1) }).ticks).toBe(360);   // level 60 * 30 = 1800, capped at 360
  });
  it('a detrimental-only focus (Chronoburn: 25 percent, type 0, min 4) does lengthen it; a beneficial-only one does not', () => {
    agent._setDurationFociCatalog([focus(9040, 25, { type_limit: 0, min_ticks: 4 }), focus(9041, 25, { type_limit: 1 })]);
    expect(dur(CHARM, { aas: aa(0), worn: [9040] }).ticks).toBe(450);
    expect(dur(CHARM, { aas: aa(0), worn: [9041] }).ticks).toBe(360);
  });
});

describe('what is unknown stays labelled', () => {
  it('no AA data on a beneficial spell: today\'s figure, estimated', () => {
    const r = dur(BUFF, { aas: null, worn: [] });
    expect(r.ticks).toBe(190); expect(r.estimated).toBe(true);
  });
  it('no worn items read: estimated', () => {
    expect(dur(BUFF, { aas: aa(1), worn: null }).estimated).toBe(true);
  });
  it('a bot with no duration_foci: estimated, gear ignored', () => {
    agent._setDurationFociCatalog(undefined);
    const r = dur(BUFF, { aas: aa(1), worn: [9001] });
    expect(r.estimated).toBe(true); expect(r.focus_pct).toBe(0);
  });
  it('an unknown caster level falls back to the era cap and says so', () => {
    const r = agent._durationWithExtensions(BUFF, 0, { kit: { aas: aa(0), worn: [] } });
    expect(r.estimated).toBe(true); expect(r.ticks).toBeGreaterThan(0);
  });
  it('a detrimental spell with AAs unread is NOT estimated for the AA (the AA cannot apply to it)', () => {
    expect(dur(DEBUFF, { aas: null, worn: [] }).estimated).toBe(false);
  });
});

describe('our own landings use the chain', () => {
  const evt = (o) => ({ spell_name: 'Aldenmar Test Buff', target: 'Brackwyn', dur_formula: 10, dur_ticks: 2000, observer: 'Aldenmar', _selfCast: true, cast_at: new Date().toISOString(), ...o });
  beforeEach(() => {
    agent._setSpellCatalogForTest([{ id: 99991, name: 'Aldenmar Test Buff', durf: 10, dur: 2000, good: 1 }]);
    agent.whoData.set('aldenmar', { level: 60 });
    agent._statsForTest().characterInventories = { Aldenmar: { items: [{ id: 9002, name: 'x', loc: 'Chest' }, { id: 9003, name: 'bag', loc: 'General1' }] } };
    agent._buffLandingsByTarget.clear();
  });
  it('our own cast carries the worn focus (only WORN slots count: the bag item is ignored)', () => {
    expect(agent._ownDurTicks(evt(), 60)).toBe(228);   // 20 percent, not the bagged 25
  });
  it('somebody else\'s cast (not _selfCast) stays the bare formula', () => {
    expect(agent._ownDurTicks(evt({ _selfCast: false }), 60)).toBe(190);
  });
  it('recordTargetBuffLanding stores the extended length', () => {
    agent.recordTargetBuffLanding(evt());
    const e = agent._buffLandingsByTarget.get('brackwyn').get('aldenmar test buff');
    expect(e.dur_ticks).toBe(228);
  });
});

describe('party timers in the pub frame (relay 1.1.0)', () => {
  const NOW = 1_800_000_000_000;
  const T = (o = {}) => ({ kind: 'buff', spell: 'Clarity', target: 'Brackwyn', caster: 'Aldenmar', endsAt: NOW + 600_000, may_break: false, ...o });
  const pub = (timers, extra = {}) => agent.partyBuildPub({ perPlayer: { Aldenmar: { dmg: 5, total: 5 } }, character: 'Aldenmar', timers, ...extra }, NOW);

  it('carries our timers, soonest first', () => {
    const f = pub([T({ spell: 'B', endsAt: NOW + 900_000 }), T({ spell: 'A', endsAt: NOW + 100_000 })]);
    expect(f.timers.map((t) => t.spell)).toEqual(['A', 'B']);
    expect(f.timers[0]).toEqual({ kind: 'buff', spell: 'A', target: 'Brackwyn', caster: 'Aldenmar', endsAt: NOW + 100_000, may_break: false });
  });
  it('an empty array is kept: it is the snapshot that clears the relay\'s copy', () => {
    expect(pub([]).timers).toEqual([]);
  });
  it('no timers key at all leaves the member\'s previous set alone', () => {
    expect('timers' in agent.partyBuildPub({ perPlayer: { Aldenmar: { dmg: 5, total: 5 } } }, NOW)).toBe(false);
  });
  it('a timer whose caster is not our own character never leaves', () => {
    expect(pub([T({ caster: 'Brackwyn' }), T({ spell: 'Mine' })]).timers.map((t) => t.spell)).toEqual(['Mine']);
  });
  it('buffs and debuffs are clamped to 20 minutes, a charm runs to 3 hours', () => {
    const f = pub([T({ endsAt: NOW + 3 * 3600_000 }), T({ kind: 'debuff', spell: 'D', endsAt: NOW + 3 * 3600_000 }), T({ kind: 'charm', spell: 'C', endsAt: NOW + 5 * 3600_000, may_break: true })]);
    const by = Object.fromEntries(f.timers.map((t) => [t.kind, t]));
    expect(by.buff.endsAt).toBe(NOW + 20 * 60_000); expect(by.debuff.endsAt).toBe(NOW + 20 * 60_000);
    expect(by.charm.endsAt).toBe(NOW + 3 * 3600_000); expect(by.charm.may_break).toBe(true);
  });
  it('an ended timer, an unknown kind and a target the relay would refuse are dropped', () => {
    const f = pub([T({ endsAt: NOW - 1 }), T({ kind: 'song' }), T({ target: 'a gnoll #3' }), T({ spell: 'Ok' })]);
    expect(f.timers.map((t) => t.spell)).toEqual(['Ok']);
  });
  it('at most 100', () => {
    const many = Array.from({ length: 130 }, (_, i) => T({ spell: 'S' + i, endsAt: NOW + 1000 + i }));
    expect(pub(many).timers.length).toBe(100);
  });
  // The real relay's validator (apps/raidmimic-relay/lib.js). A relay older than 1.1.0 (beta lags main until the sync) has no
  // timers field in its result, so this skips there and runs the moment the sync lands it.
  const relayLib = require('../apps/raidmimic-relay/lib.js');
  const relayKnowsTimers = relayLib.validatePub({ type: 'pub', timers: [] }, NOW, 'Aldenmar').pub?.timers !== undefined;
  it.skipIf(!relayKnowsTimers)('the real relay keeps every timer we send and ties it to our character', () => {
    const f = pub([T({ spell: 'A' }), T({ kind: 'debuff', spell: 'D' }), T({ kind: 'charm', spell: 'C', target: 'a skeleton', may_break: true })]);
    const r = relayLib.validatePub(JSON.parse(JSON.stringify(f)), NOW, 'Aldenmar');
    expect(r.ok).toBe(true);
    expect(r.pub.timers.length).toBe(3);
    expect(r.pub.timers.find((t) => t.kind === 'charm').may_break).toBe(true);
    expect(relayLib.validatePub(JSON.parse(JSON.stringify(f)), NOW, 'Brackwyn').pub.timers).toEqual([]);   // not their character: all dropped
  });
  it('timers alone make a frame (a charmer out of combat still shares)', () => {
    const f = agent.partyBuildPub({ character: 'Aldenmar', timers: [T()] }, NOW);
    expect(f.timers.length).toBe(1);
  });
  it('the frame stays under the relay\'s 32 KB cap', () => {
    const many = Array.from({ length: 100 }, (_, i) => T({ spell: 'A long spell name number ' + i, target: 'a very long mob name ' + String(i).repeat(5), endsAt: NOW + 1000 + i }));
    expect(JSON.stringify(pub(many)).length).toBeLessThan(32 * 1024);
  });
});

describe('_partyOwnTimers: what we cast and still have running', () => {
  const NOW = 1_800_000_000_000;
  beforeEach(() => {
    agent._buffLandingsByTarget.clear(); agent._charmTickTracker.clear();
    agent._setSpellCatalogForTest([{ id: 99991, name: 'Aldenmar Test Buff', durf: 10, dur: 2000, good: 1 }, { id: 99992, name: 'Aldenmar Test Debuff', durf: 10, dur: 2000, good: 0 }]);
  });
  const put = (target, name, o) => {
    const k = target.toLowerCase();
    if (!agent._buffLandingsByTarget.has(k)) agent._buffLandingsByTarget.set(k, new Map());
    agent._buffLandingsByTarget.get(k).set(name.toLowerCase(), { name, dur_ticks: 100, landed_at: NOW - 60_000, target_name: target, cast_by: 'Aldenmar', ...o });
  };
  it('our buff and our debuff, each with its own end; someone else\'s and an ended one are left out', () => {
    put('Brackwyn', 'Aldenmar Test Buff', {});
    put('a gnoll', 'Aldenmar Test Debuff', { dur_ticks: 50 });
    put('Brackwyn', 'Other', { cast_by: 'Corvale' });
    put('Brackwyn', 'Gone', { dur_ticks: 1, landed_at: NOW - 600_000 });
    const t = agent._partyOwnTimers('Aldenmar', NOW);
    expect(t.map((x) => [x.kind, x.spell, x.target, x.endsAt])).toEqual([
      ['buff', 'Aldenmar Test Buff', 'Brackwyn', NOW - 60_000 + 600_000],
      ['debuff', 'Aldenmar Test Debuff', 'a gnoll', NOW - 60_000 + 300_000],
    ]);
    expect(t.every((x) => x.caster === 'Aldenmar' && x.may_break === false)).toBe(true);
  });
  it('a charm is a charm timer, may_break, to its own end; a Dire Charm has none', () => {
    agent._bumpCharmTick('a skeleton', 'Aldenmar', 'land', NOW - 10_000, { duration_sec: 300, charm_spell_name: 'Allure' });
    agent._bumpCharmTick('a ghoul', 'Aldenmar', 'land', NOW - 10_000, { duration_sec: 300, is_dire_charm: true });
    agent._bumpCharmTick('a wraith', 'Corvale', 'land', NOW - 10_000, { duration_sec: 300 });
    const t = agent._partyOwnTimers('Aldenmar', NOW);
    expect(t).toEqual([{ kind: 'charm', spell: 'Allure', target: 'a skeleton', caster: 'Aldenmar', endsAt: NOW - 10_000 + 300_000, may_break: true }]);
  });
});
