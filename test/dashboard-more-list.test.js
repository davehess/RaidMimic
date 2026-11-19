// test/dashboard-more-list.test.js — the dashboard's "N more" list helper and the Top Abilities layout.
//
// The guild lead, 2026-10-21: the Top Abilities numbers sat one column right of their headers (left-aligned
// <th> over right-aligned <td class="num">, and an auto table layout gave every player's table its own
// widths), and lists that grow with characters ran down the page (33 "Archive log" rows).
//   - wpMoreList(key, rows, opts) is RUN here, not text-matched: collapsed/expanded output, the "never
//     hide exactly one row" rule, byte-stability, and that expanded state comes from the JS-side store.
//   - the CSS is checked comment-stripped (reduced-motion guard, fixed layout, right-aligned headers).
//
// Run: npx vitest run test/dashboard-more-list.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sliceBlock, evalBlock, stripJs, stripCss } from './_source-slice.js';

const raw = fs.readFileSync(path.join(ROOT, 'packages', 'wolfpack-logsync', 'dashboard.html'), 'utf8');

const fakeDoc = (els) => ({ querySelectorAll: () => els });
function load(els = []) {
  const block = sliceBlock(raw, 'var _wpMoreOpen = {};', "btn.textContent = wpMoreLabel(open, btn.getAttribute('data-n'), btn.getAttribute('data-noun'));\n}");
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fn = new Function('esc', 'document', block + '\nreturn { wpMoreList, wpMoreToggle, _wpMoreOpen };');
  return fn(esc, fakeDoc(els));
}
const rows = (n, tag = 'tr') => Array.from({ length: n }, (_, i) => `<${tag}><td>r${i}</td></${tag}>`);

describe('wpMoreList', () => {
  it('shows the first N rows, hides the rest, and offers "N more"', () => {
    const { wpMoreList } = load();
    const out = wpMoreList('k', rows(10), { show: 4, cols: 2 });
    expect(out).toContain('<tr><td>r0</td></tr>');
    expect(out).toContain('<tr data-more-row="k" hidden><td>r4</td></tr>');
    expect((out.match(/ hidden>/g) || []).length).toBe(6);
    expect(out).toContain('▾ 6 more');
    expect(out).toContain('colspan="2"');
  });
  it('never hides exactly one row behind a toggle', () => {
    const { wpMoreList } = load();
    const out = wpMoreList('k', rows(5), { show: 4 });
    expect(out).toBe(rows(5).join(''));
    expect(out).not.toContain('wp-more-btn');
  });
  it('uses a div toggle for non-table lists and the given noun', () => {
    const { wpMoreList } = load();
    const out = wpMoreList('k', rows(9, 'div'), { show: 3, noun: 'more characters' });
    expect(out).toContain('▾ 6 more characters');
    expect(out).toMatch(/<div><button type="button" class="wp-more-btn"/);
  });
  it('renders expanded from the JS-side store, so a repaint does not collapse it again', () => {
    const m = load();
    const collapsed = m.wpMoreList('k', rows(10), { show: 4, cols: 1 });
    m._wpMoreOpen.k = true;
    const expanded = m.wpMoreList('k', rows(10), { show: 4, cols: 1 });
    expect(expanded).not.toContain(' hidden>');
    expect(expanded).toContain('▴ show fewer');
    expect(expanded).toContain('aria-expanded="true"');
    expect(collapsed).not.toBe(expanded);
  });
  it('is byte-stable for identical input', () => {
    const { wpMoreList } = load();
    expect(wpMoreList('k', rows(10), { show: 4, cols: 1 })).toBe(wpMoreList('k', rows(10), { show: 4, cols: 1 }));
  });
  it('toggle flips only its own key\'s rows and records the state', () => {
    const mine = { hidden: true, getAttribute: () => 'k' };
    const other = { hidden: true, getAttribute: () => 'z' };
    const classes = new Set();
    const attrs = { 'data-more': 'k', 'data-n': '6', 'data-noun': 'more' };
    const btn = {
      getAttribute: (a) => attrs[a], setAttribute: (a, v) => { attrs[a] = v; }, textContent: '',
      classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); } },
    };
    const m = load([mine, other]);
    m.wpMoreToggle(btn);
    expect(mine.hidden).toBe(false);
    expect(other.hidden).toBe(true);
    expect(m._wpMoreOpen.k).toBe(true);
    expect(btn.textContent).toBe('▴ show fewer');
    m.wpMoreToggle(btn);
    expect(mine.hidden).toBe(true);
    expect(btn.textContent).toBe('▾ 6 more');
  });
});

describe('wpAbilityGroups (Top Abilities cards)', () => {
  const block = sliceBlock(raw, 'const WP_PLAIN_MELEE = new Set([', '  return { abilities: abilities, melee: melee, shields: shields };\n}');
  const { wpAbilityGroups } = evalBlock(block, ['wpAbilityGroups']);
  const st = (count, total) => ({ count, total });
  it('folds plain melee verbs into one line and keeps class skills as abilities', () => {
    const g = wpAbilityGroups({ slash: st(10, 1000), crush: st(5, 500), kick: st(4, 800), backstab: st(2, 900), 'flying kick': st(1, 300) });
    expect(g.melee).toEqual({ count: 15, total: 1500 });
    expect(g.abilities.map((a) => a[0])).toEqual(['backstab', 'kick', 'flying kick']);
    expect(g.shields).toEqual([]);
  });
  it('labels damage shields apart from abilities, by name or by the tank card sources', () => {
    const g = wpAbilityGroups({ thorns: st(3, 90), 'non-melee': st(2, 50), 'Aegis of Fire': st(1, 40), 'Stunning Blow': st(1, 700) }, ['Aegis of Fire']);
    expect(g.abilities.map((a) => a[0])).toEqual(['Stunning Blow']);
    expect(g.shields.map((a) => a[0])).toEqual(['thorns', 'Aegis of Fire', 'non-melee']);
  });
  it('a melee-only player has no abilities and no shields (rendered as one line)', () => {
    const g = wpAbilityGroups({ slash: st(2, 20), pierce: st(1, 5) });
    expect(g.abilities).toEqual([]);
    expect(g.shields).toEqual([]);
    expect(g.melee).toEqual({ count: 3, total: 25 });
  });
  it('is stable: equal totals sort by name whatever the key order', () => {
    const a = wpAbilityGroups({ Beta: st(1, 5), Alpha: st(1, 5) });
    const b = wpAbilityGroups({ Alpha: st(1, 5), Beta: st(1, 5) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('renders player cards in a responsive grid, 8 shown before "more players"', () => {
    const src = stripJs(raw);
    expect(src).toContain("wpMoreList('deeps|players', playerBlocks, { show: 8, noun: 'more players' })");
    expect(stripCss(raw.slice(0, raw.indexOf('</style>')))).toMatch(/\.wp-abgrid\s*\{[^}]*repeat\(auto-fill, minmax\(280px, 1fr\)\)/);
  });
});

describe('wpMoreList CSS and call sites', () => {
  const css = stripCss(raw.slice(0, raw.indexOf('</style>')));
  it('pulses by animation but respects prefers-reduced-motion', () => {
    expect(css).toMatch(/\.wp-more-btn::after\s*\{[^}]*animation:wp-more-pulse/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.wp-more-btn::after\s*\{\s*animation:none/);
  });
  it('Top Abilities tables share one fixed layout with right-aligned headers over the numbers', () => {
    expect(css).toMatch(/table\.wp-abtbl\s*\{\s*table-layout:fixed/);
    expect(css).toMatch(/th\.wp-r,\s*table\.wp-abtbl td\.wp-r\s*\{[^}]*text-align:right[^}]*tabular-nums/);
    const src = stripJs(raw);
    expect(src).not.toMatch(/<table><tr><th>Ability<\/th><th>Total<\/th>/);
    expect((src.match(/<table class="wp-abtbl"><tr><th>Ability<\/th><th class="wp-r">Total<\/th><th class="wp-r">Hits<\/th><th class="wp-r">Avg<\/th>/g) || []).length).toBe(2);
  });
  it('the Log archiving per-character list, per-player abilities and the player list are capped', () => {
    const src = stripJs(raw);
    expect(src).toContain("wpMoreList('info|archive-chars'");
    expect(src).toContain("wpMoreList('deeps|abil|' + name");
    expect(src).toContain("wpMoreList('deeps|players'");
  });
});
