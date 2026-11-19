// test/command-zone-flags.test.js — the Command Center's zone-flag note (the guild lead, 2026-11-19: "who is in raid but
// not flagged for current zone"). Runs the agent's real zoneFlagCard and the overlay's real zoneFlagsHtml.
// The rule it guards: only people CONFIRMED without the flag are named; nobody with no record is ever called unflagged,
// and the 85% door verdict only claims what holds whichever way the unknowns turn out. Names are invented.
// Run: npx vitest run test/command-zone-flags.test.js

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, ROOT, sliceBlock, evalBlock, stripJs } from './_source-slice.js';

const agent = readSource(path.join(ROOT, 'packages', 'wolfpack-logsync', 'index.js'));
const { zoneFlagCard } = evalBlock(
  sliceBlock(agent, 'function planarFlagRule(size, flagged) {', 'maxUnflagged - notFlagged : 0, short: passes ? 0 : notFlagged - maxUnflagged,\n  };\n}')
  + '\n' + sliceBlock(agent, 'const _ZONE_GATE_KEY = {', '  return out;\n}\n// The bot'),
  ['zoneFlagCard']);

const cmd = readSource(path.join(ROOT, 'apps', 'mimic', 'command.html'));
const body = sliceBlock(cmd, '  function zoneFlagsHtml(z){', "    return h + '</div>';\n  }");
// eslint-disable-next-line no-new-func
const zoneFlagsHtml = new Function('esc', 'secToggle', '_isCollapsed', body + "\nreturn zoneFlagsHtml;")(
  (s) => String(s), (k, label, n) => label + '|' + n, () => false);

const names = (n) => Array.from({ length: n }, (_, i) => 'Raider' + String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26));
const answer = (list, flagged, missing) => Object.fromEntries(list.map((nm, i) =>
  [nm.toLowerCase(), i < flagged ? 'flagged' : (i < flagged + missing ? 'missing' : 'unknown')]));

describe('zoneFlagCard', () => {
  it('is null in a zone with no gate, an empty raid, or before the bot answers', () => {
    const r = names(10);
    expect(zoneFlagCard(202, 'Plane of Knowledge', r, answer(r, 10, 0))).toBeNull();
    expect(zoneFlagCard(217, 'Plane of Fire', [], {})).toBeNull();
    expect(zoneFlagCard(217, 'Plane of Fire', r, null)).toBeNull();
  });

  it('names only the confirmed-missing and counts the rest as no record', () => {
    const r = names(10);
    const c = zoneFlagCard(210, 'Plane of Storms', r, answer(r, 6, 2));
    expect(c.missing).toEqual([r[6], r[7]].sort());
    expect(c).toMatchObject({ flagged: 6, unknown: 2, size: 10, door: null });   // Storms has no 85% door
  });

  it('treats a raider the answer does not name as no record, never as unflagged', () => {
    const r = names(4);
    const by = { [r[0].toLowerCase()]: 'flagged' };
    expect(zoneFlagCard(210, 'Plane of Storms', r, by)).toMatchObject({ missing: [], unknown: 3, flagged: 1 });
  });

  it('matches names without regard to case', () => {
    expect(zoneFlagCard(210, 'Plane of Storms', ['Aldenmar'], { aldenmar: 'missing' }).missing).toEqual(['Aldenmar']);
  });

  it('uses the 85% door only for ids 215-219', () => {
    const r = names(20);
    for (const id of [215, 216, 217, 218, 219]) expect(zoneFlagCard(id, 'Z', r, answer(r, 17, 3)).door).not.toBeNull();
    for (const id of [200, 207, 208, 209, 210, 211, 212, 214, 220, 221]) expect(zoneFlagCard(id, 'Z', r, answer(r, 17, 3)).door).toBeNull();
  });

  it('passes at exactly 85% and fails one short, with every record known', () => {
    const r = names(20);
    expect(zoneFlagCard(217, 'Z', r, answer(r, 17, 3)).door).toEqual({ pct: 85, verdict: 'pass', need: 0 });
    expect(zoneFlagCard(217, 'Z', r, answer(r, 16, 4)).door).toEqual({ pct: 80, verdict: 'fail', need: 1 });
  });

  it('says depends, not pass or fail, when the unknowns decide it', () => {
    const r = names(20);
    // 15 flagged, 1 missing, 4 no record: 15 is short of 17, but 19 would pass.
    expect(zoneFlagCard(217, 'Z', r, answer(r, 15, 1)).door).toEqual({ pct: 75, verdict: 'depends', need: 2 });
  });

  it('only says fail when it holds even if every unknown were flagged', () => {
    const r = names(20);
    // 10 flagged, 8 missing, 2 no record: best case 12 of 20.
    expect(zoneFlagCard(217, 'Z', r, answer(r, 10, 8)).door).toEqual({ pct: 50, verdict: 'fail', need: 5 });
  });

  it('floors the percentage (84.9 never reads 85)', () => {
    const r = names(53);
    expect(zoneFlagCard(217, 'Z', r, answer(r, 45, 8)).door.pct).toBe(84);
  });
});

describe('zoneFlagsHtml', () => {
  const card = (id, flagged, missing, n = 20) => { const r = names(n); return zoneFlagCard(id, 'Plane of Fire', r, answer(r, flagged, missing)); };

  it('draws nothing without a card', () => {
    expect(zoneFlagsHtml(null)).toBe('');
  });

  it('lists the confirmed-missing and a separate muted no-record line', () => {
    const html = zoneFlagsHtml(card(217, 15, 3));
    expect(html).toContain('Not flagged for Plane of Fire: <b>3</b>');
    expect(html).toContain('class="fl-dim"');
    expect(html).toContain('No flag record: 2');
    expect(html).toContain('At least <b>15 of 20</b> (75%)');
  });

  it('says Flagged, not At least, when every record is known', () => {
    const html = zoneFlagsHtml(card(217, 17, 3));
    expect(html).toContain('Flagged <b>17 of 20</b> (85%): raid can enter');
    expect(html).not.toContain('No flag record');
  });

  it('says how many more when the raid cannot enter', () => {
    expect(zoneFlagsHtml(card(217, 16, 4))).toContain('cannot enter until 1 more is flagged');
  });

  it('never claims people with no record are unflagged', () => {
    const html = zoneFlagsHtml(card(217, 10, 0));
    expect(html).not.toContain('Not flagged for');
    expect(html).toContain('No flag record: 10');
  });

  it('carries no 85% line for a zone without the door', () => {
    expect(zoneFlagsHtml(card(210, 18, 2))).not.toContain('raid can enter');
  });

  it('is byte-stable: the same card draws the same HTML', () => {
    expect(zoneFlagsHtml(card(217, 15, 3))).toBe(zoneFlagsHtml(card(217, 15, 3)));
  });

  it('caps the name list and says how many more', () => {
    const html = zoneFlagsHtml(card(210, 0, 15));
    expect((html.match(/class="fl-chip"/g) || []).length).toBe(12);
    expect(html).toContain('+3 more');
  });
});

describe('wiring', () => {
  const code = stripJs(agent);
  it('serves zone_flags in the Command Center snapshot and asks the bot for pop-zone-flags', () => {
    expect(code).toMatch(/zone_flags:\s+_zoneFlagsSnapshot\(activeChar/);
    expect(code).toContain("'/pop-zone-flags'");
  });
  it('no overlay text under 11px in the new card', () => {
    const css = cmd.split('\n').filter(l => l.includes('.flag-card')).join('\n');
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|10)px/);
  });
});
