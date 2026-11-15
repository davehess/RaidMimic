// test/raidmimic-shell.test.js — the ?v=b|c shells of raidmimic.com (the guild lead, 2026-11-15: "the formatting we have on
// Wolfpack.quest is what we should be using here"). Three halves:
//   1. The data the header and side nav draw: every href is a raidmimic path or the project's GitHub releases, none spells the
//      Wolf Pack address, and the sections are raidmimic's own (lib/raidmimicNav.ts), not a second list.
//   2. The variant decision, RUN: production and a cookie-less visit are always the shell production has.
//   3. The wiring, as text with comments stripped: HostFrame returns the old frame untouched when the shell is `a`, and the
//      middleware only sets the cookie on a host that honours it.
// Run: npx vitest run test/raidmimic-shell.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import { RAIDMIMIC_SECTIONS } from '../web/lib/raidmimicNav.ts';
import { RM_ABOUT, RM_DOWNLOADS, RM_HEADER_SECTIONS, shellSectionOf } from '../web/lib/raidmimicShell.ts';
import { RM_SHELL_COOKIE, rmShellAction, rmShellFor, rmShellHonoured } from '../web/lib/raidmimicShellVariant.ts';

const code = (rel) => stripJs(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const WOLF = /wolfpack\.quest/i;
const GITHUB = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases(\/latest|\?q=[a-z]+)?$/;

describe('the shell data', () => {
  it('the header sections ARE raidmimicNav\'s, in order', () => {
    expect(RM_HEADER_SECTIONS.map(s => s.key)).toEqual(RAIDMIMIC_SECTIONS.map(s => s.key));
    expect(RM_HEADER_SECTIONS.map(s => s.label)).toEqual(RAIDMIMIC_SECTIONS.map(s => s.label));
  });

  it('every page href is a path on a raidmimic host (or a #anchor on the landing page), none spells a Wolf Pack address', () => {
    for (const s of [...RM_HEADER_SECTIONS, RM_ABOUT]) {
      for (const h of [s.href, ...s.pages.map(p => p.href)]) {
        expect(h, `${s.key}: ${h}`).toMatch(/^\/[a-z0-9/#?=_-]*$/i);
        expect(h).not.toMatch(WOLF);
      }
    }
  });

  it('the three download chips go to GitHub releases, and say so in their names', () => {
    expect(RM_DOWNLOADS.map(d => d.key)).toEqual(['stable', 'beta', 'linux']);
    for (const d of RM_DOWNLOADS) {
      expect(d.href, d.key).toMatch(GITHUB);
      expect(d.href).not.toMatch(WOLF);
      expect(d.name).toMatch(/^Download /);
    }
    expect(new Set(RM_DOWNLOADS.map(d => d.href)).size).toBe(3);
  });

  it('the About pages are the footer\'s legal pages plus costs, and each is its own section prefix', () => {
    expect(RM_ABOUT.pages.map(p => p.href)).toEqual(['/costs', '/privacy', '/security', '/terms', '/refunds']);
    for (const p of RM_ABOUT.pages) expect(RM_ABOUT.prefixes).toContain(p.href);
  });

  it('shellSectionOf: a section page gets its section, an about page gets About, the landing page and unknown pages get none', () => {
    expect(shellSectionOf('/characters')?.key).toBe('flagging');
    expect(shellSectionOf('/guilds/new')?.key).toBe('guild');
    expect(shellSectionOf('/demo/events/needs')?.key).toBe('raids');
    expect(shellSectionOf('/costs')?.key).toBe('about');
    expect(shellSectionOf('/privacy/')?.key).toBe('about');
    expect(shellSectionOf('/')).toBeNull();
    expect(shellSectionOf('/nowhere')).toBeNull();
  });

  it('the shell components spell no Wolf Pack address', () => {
    for (const rel of ['web/lib/raidmimicShell.ts', 'web/lib/raidmimicShellVariant.ts', 'web/components/RaidmimicHeader.tsx',
      'web/components/RaidmimicSideShell.tsx', 'web/components/RaidmimicShell.tsx', 'web/components/RaidmimicShellFooter.tsx']) {
      expect(code(rel), rel).not.toMatch(WOLF);
    }
  });
});

describe('which shell a request gets', () => {
  it('production hosts never honour a variant, cookie or not', () => {
    for (const host of ['raidmimic.com', 'www.raidmimic.com', 'raidmimic.net', 'raidmimic.quest', 'wolf.raidmimic.com', null]) {
      expect(rmShellHonoured(host, false), String(host)).toBe(false);
      expect(rmShellFor(host, 'b', false), String(host)).toBe('a');
      expect(rmShellFor(host, 'c', false), String(host)).toBe('a');
    }
  });

  it('the beta mirror and a beta build honour it; no cookie, a clear cookie or junk is still the production shell', () => {
    expect(rmShellFor('b.raidmimic.com', 'b', false)).toBe('b');
    expect(rmShellFor('B.RaidMimic.com:3000', 'c', false)).toBe('c');
    expect(rmShellFor('anything.example', 'b', true)).toBe('b');
    for (const cookie of [undefined, '', 'a', 'x', 'B']) expect(rmShellFor('b.raidmimic.com', cookie, true)).toBe('a');
  });

  it('?v= sets for b and c, clears for a, and ignores everything else', () => {
    expect(rmShellAction('b')).toBe('set');
    expect(rmShellAction('c')).toBe('set');
    expect(rmShellAction('a')).toBe('clear');
    for (const v of [null, undefined, '', 'd', 'B']) expect(rmShellAction(v)).toBeNull();
    expect(RM_SHELL_COOKIE).toBe('rm_shell');
  });
});

describe('the wiring', () => {
  it('HostFrame hands the page back untouched off a raidmimic host, and with shell `a` returns the frame production has', () => {
    const src = code('web/components/RaidmimicFrame.tsx');
    const frame = src.slice(src.indexOf('export default function HostFrame'));
    expect(frame.indexOf('if (!onHost) return <>{children}</>;')).toBeGreaterThan(0);
    const guard = frame.indexOf("if (shell !== 'a') return <ShellFrame variant={shell}>{children}</ShellFrame>;");
    expect(guard).toBeGreaterThan(frame.indexOf('if (!onHost)'));
    const tail = frame.slice(guard);
    expect(tail).toContain('<div className={`mx-auto w-full ${width}`}>');
    expect(tail).toContain('<HostBar />');
    expect(tail).toContain('<Footer onHost />');
    expect(src).toContain('export function HostBar()');   // the landing and the set-up guide still draw the old bar
  });

  it('currentShell reads the cookie only on a host that honours it', () => {
    const src = code('web/components/RaidmimicShell.tsx');
    expect(src.indexOf('if (!rmShellHonoured(host, beta)) return \'a\';')).toBeGreaterThan(0);
    expect(src.indexOf('if (!rmShellHonoured(host, beta))')).toBeLessThan(src.indexOf('cookies().get(RM_SHELL_COOKIE)'));
  });

  it('the middleware sets the cookie only for a raidmimic host that honours the variant, and never on the landing page', () => {
    const src = code('web/middleware.ts');
    const block = src.slice(src.indexOf('rmShellAction('), src.indexOf('// eqmimic.quest (the guild lead, 2026-10-08)'));
    expect(block).toContain('isRaidmimicHost(host)');
    expect(block).toContain("rmShellHonoured(host, process.env.NEXT_PUBLIC_IS_BETA === '1')");
    expect(block).toContain('raidmimicLandingTarget(path).pathname !== RAIDMIMIC_LANDING_PATH');
    expect(block).toContain("request.method === 'GET'");
  });
});
