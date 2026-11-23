// test/command-rathe-council.test.js — the Command Center's Rathe Council card (the guild lead, 2026-11-20).
// Runs the agent's real councilNote / councilSlain / councilSweep / councilCard and the overlay's real councilHtml.
// Rules guarded: tracked by spawn id (same names), latest sample wins, unknown HP is "?" never 0, the 420 s window rolls
// from the OLDEST death, a dead id is removed when its countdown ends, critical-low needs the others' median.
// Run: npx vitest run test/command-rathe-council.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, ROOT, sliceBlock, evalBlock } from './_source-slice.js';

const agent = readSource(path.join(ROOT, 'packages', 'wolfpack-logsync', 'index.js'));
const lib = evalBlock(
  sliceBlock(agent, 'const COUNCIL_ZONE_ID = 222;', '    low, rows,\n  };\n}\n'),
  ['COUNCIL_RESPAWN_S', 'COUNCIL_LOW_HP', 'COUNCIL_SIZE', '_council', '_isCouncilName', 'councilNote', 'councilSlain', 'councilSweep', 'councilCard']);
const { COUNCIL_RESPAWN_S, _isCouncilName, councilNote, councilSlain, councilSweep, councilCard } = lib;

const cmd = readSource(path.join(ROOT, 'apps', 'mimic', 'command.html'));
const body = sliceBlock(cmd, '  function councilHtml(c, nowMs){', "    return h + '</div>';\n  }");
// eslint-disable-next-line no-new-func
const render = new Function('secToggle', '_isCollapsed', body + '\nreturn councilHtml;')((k, label, n) => label + '|' + n, () => false);

const T0 = 1_000_000_000_000;
const fresh = () => ({ mobs: new Map(), lastSlainAt: 0 });
const see = (st, id, hp, at, extra = {}) => councilNote(st, { id, hp, at, src: 'ext', ...extra }, at);

describe('councilNote', () => {
  it('keys by spawn id: same name, separate rows; latest sample wins', () => {
    const st = fresh();
    see(st, 4401, 80, T0); see(st, 4402, 60, T0); see(st, 4401, 55, T0 + 2000); see(st, 4401, 70, T0 + 1000);
    expect(st.mobs.size).toBe(2);
    expect(st.mobs.get(4401).hp).toBe(55);
  });
  it('keeps HP unknown (null, not 0) until a sample carries one', () => {
    const st = fresh();
    see(st, 4401, null, T0);
    expect(councilCard(st, T0).rows[0].hp).toBeNull();
  });
  it('a fresh local sample is not overwritten by the bot aggregate', () => {
    const st = fresh();
    councilNote(st, { id: 4401, hp: 30, at: T0, src: 'local' }, T0);
    councilNote(st, { id: 4401, hp: 90, at: T0 + 3000, src: 'ext' }, T0 + 3000);
    expect(st.mobs.get(4401).hp).toBe(30);
    councilNote(st, { id: 4401, hp: 90, at: T0 + 20000, src: 'ext' }, T0 + 20000);
    expect(st.mobs.get(4401).hp).toBe(90);
  });
  it('root and slow keep the later end', () => {
    const st = fresh();
    see(st, 4401, 50, T0, { root_end: T0 + 40000, slow_end: T0 + 60000 });
    see(st, 4401, 50, T0 + 1000, { root_end: T0 + 30000, slow_end: T0 + 90000 });
    const r = councilCard(st, T0 + 2000).rows[0];
    expect(r.root_end).toBe(T0 + 40000);
    expect(r.slow_end).toBe(T0 + 90000);
  });
  it('an HP of 0 is a death at that time and later samples are ignored', () => {
    const st = fresh();
    see(st, 4401, 5, T0); see(st, 4401, 0, T0 + 1000); see(st, 4401, 40, T0 + 2000);
    expect(st.mobs.get(4401).dead_at).toBe(T0 + 1000);
    expect(st.mobs.get(4401).hp).toBe(0);
  });
});

describe('deaths and the rolling window', () => {
  it('a slain line goes to the lowest-HP live id that was low enough; none low enough credits nobody', () => {
    const st = fresh();
    see(st, 4401, 60, T0); see(st, 4402, 12, T0); see(st, 4403, 20, T0);
    expect(councilSlain(st, T0 + 5000)).toBe(true);
    expect(st.mobs.get(4402).dead_at).toBe(T0 + 5000);
    expect(councilSlain(st, T0 + 9000)).toBe(true);   // 4403 at 20 is the next lowest and under the cap
    const st2 = fresh(); see(st2, 4401, 60, T0);
    expect(councilSlain(st2, T0 + 5000)).toBe(false);
  });
  it('the same slain line printed twice within the dedup window counts once', () => {
    const st = fresh();
    see(st, 4401, 5, T0); see(st, 4402, 6, T0);
    councilSlain(st, T0 + 1000);
    expect(councilSlain(st, T0 + 1300)).toBe(false);
    expect([...st.mobs.values()].filter(m => m.dead_at != null).length).toBe(1);
  });
  it('an id last seen nearly dead and then gone for a few seconds is dead, at its last sighting', () => {
    const st = fresh();
    see(st, 4401, 4, T0);
    councilSweep(st, T0 + 3000);
    expect(st.mobs.get(4401).dead_at).toBeNull();
    councilSweep(st, T0 + 8000);
    expect(st.mobs.get(4401).dead_at).toBe(T0);
  });
  it('an id gone while healthy is not called dead; it just ages out', () => {
    const st = fresh();
    see(st, 4401, 70, T0);
    councilSweep(st, T0 + 60_000);
    expect(st.mobs.get(4401).dead_at).toBeNull();
    councilSweep(st, T0 + 130_000);
    expect(st.mobs.has(4401)).toBe(false);
  });
  it('the window is 420 s from the OLDEST death and a corpse leaves when its time is up', () => {
    const st = fresh();
    see(st, 4401, 0, T0); see(st, 4402, 0, T0 + 100_000); see(st, 4403, 50, T0 + 100_000);
    const c = councilCard(st, T0 + 150_000);
    expect(c.down).toBe(2);
    expect(c.back_at).toBe(T0 + COUNCIL_RESPAWN_S * 1000);
    councilSweep(st, T0 + COUNCIL_RESPAWN_S * 1000 + 1);
    const c2 = councilCard(st, T0 + COUNCIL_RESPAWN_S * 1000 + 1);
    expect(c2.down).toBe(1);
    expect(c2.back_at).toBe(T0 + 100_000 + COUNCIL_RESPAWN_S * 1000);
  });
  it('"only N of 12 seen" shows only while nothing is dead and fewer than 12 are known', () => {
    const st = fresh();
    for (let i = 0; i < 7; i++) see(st, 4400 + i, 100, T0);
    expect(councilCard(st, T0).warn).toBe(7);
    see(st, 4400, 0, T0 + 1000);
    expect(councilCard(st, T0 + 1000).warn).toBeNull();
    const full = fresh();
    for (let i = 0; i < 12; i++) see(full, 4400 + i, 100, T0);
    expect(councilCard(full, T0).warn).toBeNull();
  });
});

describe('critical low', () => {
  const board = (hps) => { const st = fresh(); hps.forEach((h, i) => see(st, 4400 + i, h, T0)); return councilCard(st, T0); };
  it('fires for one at or under 20% while the median of the others is 50%+', () => {
    expect(board([18, 90, 80, 70, 60, 55]).low).toEqual({ id: 4400, hp: 18 });
  });
  it('stays quiet when the others are low too, or when too few others are known', () => {
    expect(board([18, 40, 30, 45, 35, 30]).low).toBeNull();
    expect(board([18, 90, 80]).low).toBeNull();
  });
  it('an unknown HP is neither low nor counted among the others', () => {
    expect(board([null, 90, 80, 70, 60]).low).toBeNull();
  });
});

describe('councilHtml', () => {
  const st = fresh();
  see(st, 4401, 63, T0, { root_end: T0 + 42_000, slow_end: T0 + 70_000 });
  see(st, 4402, null, T0);
  see(st, 4403, 0, T0 + 1000);
  const card = councilCard(st, T0 + 2000);
  const html = render(card, T0 + 2000);
  it('draws a slim row per live id with HP, root and slow, and "?" for an unknown HP', () => {
    expect(html).toContain('#4401');
    expect(html).toContain('63%');
    expect(html).toContain('root 0:40');
    expect(html).toContain('slow 1:08');
    expect(html).toMatch(/#4402[^]*?<span class="cn-hp">\?<\/span>/);
  });
  it('greys the dead one with its respawn countdown and heads the card with the count', () => {
    expect(html).toMatch(/cn-row dead[^]*#4403[^]*back 6:59/);
    expect(html).toContain('1/12 down');
    expect(html).toContain('12th within 6:59');
  });
  it('is byte-identical for the same input and empty for no card', () => {
    expect(render(card, T0 + 2000)).toBe(html);
    expect(render(null, T0)).toBe('');
  });
  it('shows the low alert and the do-not-kill warning', () => {
    const s2 = fresh();
    [18, 90, 80, 70, 60].forEach((h, i) => see(s2, 4400 + i, h, T0));
    const h2 = render(councilCard(s2, T0), T0);
    expect(h2).toContain('#4400 low 18% - hold dps');
    expect(h2).toContain('Do not kill: only 5 of 12 seen');
  });
});

describe('councilName', () => {
  it('matches the in-game and catalog spellings only', () => {
    for (const n of ['A Rathe Councilman', 'a Rathe Councilman', 'A_Rathe_Councilman', '#A_Rathe_Councilman']) expect(_isCouncilName(n)).toBe(true);
    for (const n of ['A Council Protector', 'a Rathe Councilman corpse', '']) expect(_isCouncilName(n)).toBe(false);
  });
});
