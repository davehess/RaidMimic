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
import { dsChoice, DS_COOKIE } from '../web/lib/designPreview.ts';
import { metaForPath } from '../web/lib/pageMeta.ts';

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
  it('on beta: ?ds= sets, ?ds=off clears, otherwise the cookie decides, junk is ignored', () => {
    expect(dsChoice('b', undefined, true)).toEqual({ on: 'b', action: 'set' });
    expect(dsChoice('off', 'c', true)).toEqual({ on: null, action: 'clear' });
    expect(dsChoice(null, 'c', true)).toEqual({ on: 'c', action: 'keep' });
    expect(dsChoice('zzz', 'x', true)).toEqual({ on: null, action: 'keep' });
  });
  it('layout and middleware both pass the beta flag; the chip renders only when it is set', () => {
    const layout = stripJs(readSource(web('app', 'layout.tsx')));
    expect(layout).toMatch(/dsChoice\(null,\s*cookies\(\)\.get\(DS_COOKIE\)\?\.value,\s*IS_BETA\)/);
    expect(layout).toMatch(/\{IS_BETA && <DesignSwitch/);
    expect(layout).toMatch(/data-ds=\{ds \?\? undefined\}/);
    const mw = stripJs(readSource(web('middleware.ts')));
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
