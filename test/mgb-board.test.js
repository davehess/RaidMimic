// test/mgb-board.test.js — the MGB board (utils/mgbBoard.js): detector thresholds, attribution order, cooldown math,
// and the two routes' wiring + shape. Names are the invented ones (Aldenmar, Brackwyn, ...), none of them anybody.
//
// What can go wrong without anyone noticing:
//   * an ordinary group buff (6 people, one group) reads as an MGB, or a real one (12 targets, 2 groups) is missed;
//   * the attribution skips a better source (an own_log activation ignored because a cast_stream row exists);
//   * the cooldown counts from the landing instead of the press, so a holder reads ready minutes early/late;
//   * a route answers without the agent-auth gate.
// Run: npx vitest run test/mgb-board.test.js

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readSource, sliceBlock, stripJs, BOT_INDEX } from './_source-slice.js';

const nodeRequire = createRequire(import.meta.url);
const mgb = nodeRequire('../utils/mgbBoard.js');

const T0 = Date.parse('2026-11-20T01:00:00Z');
const SPELL = 7001;   // a group spell in the fake catalog
const names = (n) => Array.from({ length: n }, (_, i) => `Raider${String.fromCharCode(97 + i)}`);
// landing at T0 + i*stepMs on target i; group = i % groups (+1)
const landings = (n, { stepMs = 100, spell = SPELL } = {}) =>
  names(n).map((target, i) => ({ spell_id: spell, spell: 'Wrath of the Wild', target, t: T0 + i * stepMs }));
const groupsOf = (groups) => { const m = new Map(names(40).map((n, i) => [n.toLowerCase(), (i % groups) + 1])); return (n) => m.get(n.toLowerCase()) ?? null; };
const detect = (ls, groups = 2, extra = {}) => mgb.detectMgbs(ls, { isGroupSpell: (id) => id === SPELL, groupOf: groupsOf(groups), ...extra });

describe('detectMgbs thresholds', () => {
  it('12 targets across 2 groups inside 3 s is an MGB', () => {
    const out = detect(landings(12));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ spell_id: SPELL, at: T0 });
    expect(out[0].targets).toHaveLength(12);
    expect(out[0].groups.sort()).toEqual([1, 2]);
  });
  it('11 targets is not', () => expect(detect(landings(11))).toEqual([]));
  it('12 targets all in one group is not', () => expect(detect(landings(12), 1)).toEqual([]));
  it('12 targets spread over more than 3 s is not', () => expect(detect(landings(12, { stepMs: 400 }))).toEqual([]));
  it('12 landings that are one target seen by 12 observers is not', () => {
    const ls = names(12).map((_, i) => ({ spell_id: SPELL, spell: 'x', target: 'Aldenmar', t: T0 + i }));
    expect(detect(ls)).toEqual([]);
  });
  it('a spell outside the group catalog is ignored', () => expect(detect(landings(12, { spell: 9999 }))).toEqual([]));
  it('two MGBs a minute apart are two events', () => {
    const second = landings(12).map(l => ({ ...l, t: l.t + 60_000 }));
    expect(detect([...landings(12), ...second])).toHaveLength(2);
  });
});

describe('attribution order', () => {
  const holders = [{ name: 'Aldenmar', class: 'Cleric' }, { name: 'Brackwyn', class: 'Druid' }, { name: 'Corvale', class: 'Wizard' }];
  const ev = { at: T0 + 5000, spell: 'Wrath of the Wild' };
  const druidOnly = new Set(['druid']);

  it('own_log wins over a cast_stream row', () => {
    const a = mgb.attribute(ev, {
      holders, classKeys: druidOnly,
      ownLog: new Map([['brackwyn', { at: T0 - 8000, spell: null }]]),
      casts: [{ caster: 'Aldenmar', spell: 'Wrath of the Wild', cast_at: T0 + 2000, cast_secs: 3 }],
    });
    expect(a).toMatchObject({ caster: 'Brackwyn', basis: 'own_log', pressAt: T0 - 8000 });
  });
  it('an own_log activation older than 60 s, or of a class without the spell, is skipped', () => {
    const old = mgb.attribute(ev, { holders, classKeys: druidOnly, ownLog: new Map([['brackwyn', { at: T0 - 70_000 }]]), casts: [] });
    expect(old.basis).toBe('candidates');
    const wrongClass = mgb.attribute(ev, { holders, classKeys: druidOnly, ownLog: new Map([['aldenmar', { at: T0 - 5000 }]]), casts: [] });
    expect(wrongClass.basis).toBe('candidates');
  });
  it('an own_log naming a different spell does not match', () => {
    const a = mgb.attribute(ev, { holders, classKeys: druidOnly, ownLog: new Map([['brackwyn', { at: T0, spell: 'Something Else' }]]), casts: [] });
    expect(a.basis).toBe('candidates');
  });
  it('cast_stream: the cast finishing within 2 s of the landing', () => {
    const a = mgb.attribute(ev, { holders, classKeys: druidOnly, ownLog: new Map(),
      casts: [{ caster: 'Brackwyn', spell: 'Wrath of the Wild', cast_at: T0 + 2000, cast_secs: 3.5 }] });
    expect(a).toMatchObject({ caster: 'Brackwyn', basis: 'cast_stream', castSecs: 3.5 });
    const far = mgb.attribute(ev, { holders, classKeys: druidOnly, ownLog: new Map(),
      casts: [{ caster: 'Brackwyn', spell: 'Wrath of the Wild', cast_at: T0 + 2000, cast_secs: 0.5 }] });   // finishes 2.5 s early
    expect(far.basis).toBe('candidates');
  });
  it('candidates: trained holders of a class with the spell; everyone when the class list is unknown', () => {
    expect(mgb.attribute(ev, { holders, classKeys: druidOnly, ownLog: new Map(), casts: [] }))
      .toMatchObject({ caster: null, basis: 'candidates', candidates: ['Brackwyn'] });
    expect(mgb.attribute(ev, { holders, classKeys: null, ownLog: new Map(), casts: [] }).candidates).toEqual(['Aldenmar', 'Brackwyn', 'Corvale']);
  });
  it('a holder whose cooldown is still running is not a candidate', () => {
    const a = mgb.attribute(ev, { holders, classKeys: null, ownLog: new Map(), casts: [],
      readyAt: (k) => (k === 'aldenmar' ? T0 + 3_600_000 : null) });
    expect(a.candidates).toEqual(['Brackwyn', 'Corvale']);
  });
});

describe('cooldown math', () => {
  it('own_log counts 4320 s from the press', () => {
    expect(mgb.mgbReadyAt('own_log', { activationMs: T0, landingMs: T0 + 9000 })).toBe(T0 + 4320_000);
  });
  it('cast_stream counts 4320 s from the landing minus the cast time', () => {
    expect(mgb.mgbReadyAt('cast_stream', { landingMs: T0 + 5000, castSecs: 3.5 })).toBe(T0 + 5000 - 3500 + 4320_000);
  });
});

// A service over fake deps. The clock is fixed so ring pruning and ready_at are exact.
function service({ rows, casts = [], classes = new Set(['druid']), trained = ['brackwyn', 'aldenmar', 'corvale'], now = T0 + 6000 } = {}) {
  const roster = rows || names(14).map((n, i) => ({ name: n, class: 'Warrior', group_num: (i % 2) + 1, captured_at: '2026-11-20T01:00:00Z' }))
    .concat([
      { name: 'Brackwyn', class: 'Druid', group_num: 1, captured_at: '2026-11-20T01:00:00Z' },
      { name: 'Aldenmar', class: 'Cleric', group_num: 2, captured_at: '2026-11-20T01:00:00Z' },
      { name: 'Corvale', class: 'Wizard', group_num: 2, captured_at: '2026-11-20T01:00:00Z' },
    ]);
  const calls = { castsNear: 0 };
  const svc = mgb.create({
    now: () => now,
    spellInfo: (id) => (id === SPELL ? { name: 'Wrath of the Wild', castSecs: 3.5 } : null),
    loadSpells() {},
    rosterRows: async () => roster,
    trainedSet: async () => new Set(trained),
    spellClasses: async () => classes,
    castsNear: async () => { calls.castsNear++; return casts; },
  });
  const feed = (n = 12) => svc.noteLandings(names(n).map((target, i) => ({
    spell_id: SPELL, spell_name: 'Wrath of the Wild', target, cast_at: new Date(T0 + i * 100).toISOString(),
  })));
  return { svc, feed, calls };
}

describe('service: board contract', () => {
  it('detects on ingest and answers the exact contract with candidates when nobody proves the cast', async () => {
    const { svc, feed } = service();
    feed();
    const out = await svc.board({ members: null });
    expect(Object.keys(out).sort()).toEqual(['holders', 'mgbs', 'now']);
    expect(out.now).toBe(new Date(T0 + 6000).toISOString());
    expect(out.mgbs).toEqual([{
      at: new Date(T0).toISOString(), spell: 'Wrath of the Wild', spell_id: SPELL, targets: 12, groups: 2,
      caster: null, basis: 'candidates', candidates: ['Brackwyn'],
    }]);
    expect(out.holders).toEqual([
      { name: 'Aldenmar', class: 'Cleric', ready_at: null, last_spell: null, basis: null },
      { name: 'Brackwyn', class: 'Druid', ready_at: null, last_spell: null, basis: null },
      { name: 'Corvale', class: 'Wizard', ready_at: null, last_spell: null, basis: null },
    ]);
  });

  it('11 targets produce no MGB', async () => {
    const { svc, feed } = service();
    feed(11);
    expect((await svc.board({ members: null })).mgbs).toEqual([]);
  });

  it('cast_stream names the caster and starts their cooldown at landing minus cast time', async () => {
    const { svc, feed } = service({ casts: [{ caster: 'Brackwyn', spell: 'Wrath of the Wild', cast_at: new Date(T0 - 3500).toISOString(), cast_secs: 3.5 }] });
    feed();
    const out = await svc.board({ members: null });
    expect(out.mgbs[0]).toMatchObject({ caster: 'Brackwyn', basis: 'cast_stream', candidates: ['Brackwyn'] });
    const h = out.holders.find(x => x.name === 'Brackwyn');
    expect(h).toEqual({ name: 'Brackwyn', class: 'Druid', basis: 'cast_stream', last_spell: 'Wrath of the Wild',
      ready_at: new Date(T0 - 3500 + 4320_000).toISOString() });
  });

  it('an own_log activation that arrives AFTER the detection upgrades the attribution and the cooldown', async () => {
    const { svc, feed } = service();
    feed();
    expect((await svc.board({ members: null })).mgbs[0].basis).toBe('candidates');
    expect(svc.noteActivation({ character: 'Brackwyn', at: new Date(T0 - 6000).toISOString(), spell: 'Wrath of the Wild' }).status).toBe(200);
    const out = await svc.board({ members: null });
    expect(out.mgbs[0]).toMatchObject({ caster: 'Brackwyn', basis: 'own_log' });
    expect(out.holders.find(x => x.name === 'Brackwyn')).toMatchObject({ basis: 'own_log', ready_at: new Date(T0 - 6000 + 4320_000).toISOString() });
  });

  it('scopes to the caller\'s raid: another raid\'s MGB and holders stay out', async () => {
    const { svc, feed } = service();
    feed();
    const out = await svc.board({ members: new Set(['aldenmar', 'brackwyn']) });
    expect(out.mgbs).toEqual([]);
    expect(out.holders.map(h => h.name)).toEqual(['Aldenmar', 'Brackwyn']);
  });

  it('a press with no activity is ready (unknown): ready_at null', async () => {
    const { svc } = service();
    expect((await svc.board({ members: null })).holders.every(h => h.ready_at === null)).toBe(true);
  });

  it('noteActivation validates and keeps the last per character', () => {
    const { svc } = service();
    expect(svc.noteActivation({}).status).toBe(400);
    svc.noteActivation({ character: 'Corvale', at: new Date(T0 - 1000).toISOString() });
    svc.noteActivation({ character: 'corvale', at: new Date(T0 - 5000).toISOString() });   // older: ignored
    expect(svc._state().ownLog.get('corvale').at).toBe(T0 - 1000);
  });

  it('never throws on garbage rows', () => {
    const { svc } = service();
    expect(() => svc.noteLandings([null, {}, { spell_id: SPELL }, { spell_id: SPELL, target: 'x', cast_at: 'nope' }])).not.toThrow();
  });
});

describe('route wiring in index.js', () => {
  const code = stripJs(readSource(BOT_INDEX));
  const post = sliceBlock(code, 'async function _handleAgentMgbPost(req, res) {', '\n}');
  const board = sliceBlock(code, 'async function _handleAgentMgbBoard(req, res) {', '\n}');

  it('both handlers check agent auth before anything else', () => {
    for (const h of [post, board]) {
      const first = h.split('\n').slice(1, 3).join('\n');
      expect(first).toMatch(/requireAgentAuth\(req, res\)/);
      expect(first).toMatch(/if \(!identity\) return;/);
    }
  });
  it('the dispatcher routes GET /mgb-board and POST /mgb', () => {
    expect(code).toMatch(/req\.method === 'GET' && req\.url\.startsWith\('\/api\/agent\/mgb-board'\)/);
    expect(code).toMatch(/req\.method === 'POST' && req\.url === '\/api\/agent\/mgb'\)/);
  });
  it('the board scopes to the caller\'s raid and caches 5 s', () => {
    expect(board).toMatch(/_liveRaidSplit\(/);
    expect(board).toMatch(/raidFor\(\{ discordId: identity\.discord_id/);
    expect(board).toMatch(/, 5000,/);
  });
  it('the buff_casts ingest feeds the detector with accepted rows, no read', () => {
    expect(code).toMatch(/_mgbService\(\)\.noteLandings\(resolved\)/);
  });
});
