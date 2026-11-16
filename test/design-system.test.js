// test/design-system.test.js — the design-system preview (the guild lead, 2026-11-16: "start with base design, so
// everything can feel like one site"). The look is a PREVIEW on the beta mirror, so what must hold is that
// production cannot see it, that the switch is gated on the beta flag, that /design is a real page with its card,
// and that the shared components name colours only through tokens.
//
// Run: npx vitest run test/design-system.test.js

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ROOT, readSource, stripJs, stripCss } from './_source-slice.js';
import { dsChoice, DS_COOKIE, DS_BOOT_SCRIPT } from '../web/lib/designPreview.ts';
import { metaForPath } from '../web/lib/pageMeta.ts';
import { pickSamples, span, timerSample } from '../web/lib/designSamples.ts';

const web = (...p) => path.join(ROOT, 'web', ...p);

describe('preview CSS is scoped to html[data-ds]', () => {
  it('every rule in the globals.css preview block starts with html[data-ds]', () => {
    const css = readSource(web('app', 'globals.css'));
    const block = stripCss(css.slice(css.indexOf('/* ── Design-system preview')));
    const selectors = block.split('}').map(r => r.split('{')[0].trim()).filter(s => s && !s.startsWith('@media'));
    expect(selectors.length).toBeGreaterThan(5);
    for (const sel of selectors) for (const one of sel.replace(/:is\([^)]*\)/g, ':is()').split(',')) expect(one.trim()).toMatch(/^html\[data-ds/);
  });

  it('tokens.css overrides --wp-dim / --wp-title only under html[data-ds], never on :root', () => {
    const css = stripCss(readSource(web('app', 'tokens.css')));
    const root = css.match(/:root\s*\{[^}]*\}/g).join('\n');
    expect(root).not.toMatch(/--wp-dim:\s*154/);
    expect(root).toMatch(/--wp-dim:\s*110 118 129/);          // production grey unchanged
    expect(root).toMatch(/--wp-title:\s*var\(--wp-gold\)/);   // gold title today
    expect(css).toMatch(/html\[data-ds\]\s*\{[^}]*--wp-title:\s*var\(--wp-text\)/);
    for (const v of ['a', 'b', 'c']) expect(css).toContain(`html[data-ds="${v}"]`);
  });
});

describe('the switch is beta-only', () => {
  it('dsChoice answers "off" on production whatever the URL or cookie says', () => {
    expect(dsChoice('a', 'b', false)).toEqual({ on: null, action: 'keep' });
  });
  it('on beta: ?ds= sets, ?ds=off stores off, the cookie decides, and no cookie (or junk) is the picked default B', () => {
    expect(dsChoice('b', undefined, true)).toEqual({ on: 'b', action: 'set' });
    expect(dsChoice('off', 'c', true)).toEqual({ on: null, action: 'off' });
    expect(dsChoice(null, 'off', true)).toEqual({ on: null, action: 'keep' });
    expect(dsChoice(null, 'c', true)).toEqual({ on: 'c', action: 'keep' });
    expect(dsChoice(null, undefined, true)).toEqual({ on: 'b', action: 'keep' });
    expect(dsChoice('zzz', 'x', true)).toEqual({ on: 'b', action: 'keep' });
  });
  it('the static-page boot script applies the default and honours off', () => {
    const run = (cookie) => {
      const attrs = {};
      new Function('document', DS_BOOT_SCRIPT)({ cookie, documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } });
      return attrs['data-ds'] ?? null;
    };
    expect(run('')).toBe('b');
    expect(run('wp_ds=c')).toBe('c');
    expect(run('x=1; wp_ds=off')).toBe(null);
  });
  it('layout and middleware both pass the beta flag; the chip renders only when it is set', () => {
    const layout = stripJs(readSource(web('app', 'layout.tsx')));
    // The layout takes the middleware's decision from a request header (it must not call cookies(): guild-theme test).
    expect(layout).toMatch(/dsChoice\(null,\s*headers\(\)\.get\(DS_HEADER\) \?\? undefined,\s*IS_BETA\)/);
    expect(layout).not.toMatch(/cookies\(\)/);
    expect(layout).toMatch(/\{IS_BETA && <DesignSwitch/);
    expect(layout).toMatch(/data-ds=\{ds \?\? undefined\}/);
    const mw = stripJs(readSource(web('middleware.ts')));
    // A client cannot inject the header: the middleware drops any incoming one before setting its own.
    expect(mw.indexOf('request.headers.delete(DS_HEADER)')).toBeGreaterThan(-1);
    expect(mw.indexOf('request.headers.delete(DS_HEADER)')).toBeLessThan(mw.indexOf("request.headers.set(DS_HEADER, ds.on ?? 'off')"));
    expect(mw).toMatch(/dsChoice\([\s\S]*?process\.env\.NEXT_PUBLIC_IS_BETA === '1'\)/);
    expect(DS_COOKIE).toBe('wp_ds');
  });
});

describe('/design', () => {
  it('has metadata, the [beta] tag and a pageMeta card', () => {
    const page = readSource(web('app', 'design', 'page.tsx'));
    expect(page).toMatch(/export const metadata/);
    expect(page).toContain('<NewPageTag');
    const m = metaForPath('/design');
    expect(m.title).toMatch(/Design system/);
    expect(m.description.length).toBeGreaterThan(30);
  });

  // The guild lead, 2026-11-16: "These examples are crappy. Nagafen isn't killable every day ... Use real timers."
  it('samples are the real boss timers: members only, read from bot_boards, no made-up rows', () => {
    const page = stripJs(readSource(web('app', 'design', 'page.tsx')));
    expect(page).toMatch(/await requireMember\(user\.id\)/);
    expect(page).toMatch(/from\('bot_boards'\)/);
    expect(page).not.toMatch(/three nights running|kills: \d, total: 6/);
  });
});

describe('designSamples', () => {
  const now = Date.parse('2026-11-16T22:00:00Z');
  const h = 3_600_000;
  const row = (id, hours, killedAgoH, name = id) => ({
    boss_id: id, name, zone: 'Zone', timer_hours: hours,
    killed_at: killedAgoH == null ? null : new Date(now - killedAgoH * h).toISOString(),
    next_spawn: killedAgoH == null ? null : new Date(now - killedAgoH * h + hours * h).toISOString(),
  });
  it('words a timer: running (gold), available (green, no kill time = available, as /boards reads it), days past 48 hours', () => {
    expect(timerSample(row('a', 162, 100), now)).toMatchObject({ state: 'cooldown', when: 'in 2d 14h', done: 6000, total: 9720 });
    expect(timerSample(row('b', 72, 66), now)).toMatchObject({ state: 'soon', when: 'in 6h 0m' });
    expect(timerSample(row('c', 72, 80), now)).toMatchObject({ state: 'up', when: 'available now', done: 4320, total: 4320 });
    expect(timerSample(row('d', 72, null), now)).toMatchObject({ state: 'up', when: 'available now', done: 4320 });
    expect(span(214 * h + 60_000)).toBe('8d 22h');
  });
  it('shows every running timer soonest first, then available bosses in the same zones before any other', () => {
    const z = (r, zone) => ({ ...r, zone });
    const rows = [z(row('late', 162, 10), 'Air'), z(row('soon', 72, 70), 'Air'), z(row('xeg', 138, null), 'Air'),
      z(row('elsewhere', 162, null), 'Hate'), z(row('mid', 96, 50), 'Air')];
    expect(pickSamples(rows, now, 5).map(s => s.id)).toEqual(['soon', 'mid', 'late', 'xeg', 'elsewhere']);
  });
});

describe('shared components use tokens, not hex', () => {
  const dir = web('components', 'ui');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));
  it('exists with the five parts', () => {
    for (const n of ['PageHeader', 'Button', 'Chip', 'Card', 'DataTable']) expect(files).toContain(`${n}.tsx`);
  });
  for (const f of files) {
    it(`${f} has no raw hex or rgb() colour`, () => {
      const src = stripJs(readSource(path.join(dir, f)));
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/\brgba?\(\s*\d/);
    });
  }
});
