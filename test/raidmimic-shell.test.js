// test/raidmimic-shell.test.js — the frame of raidmimic.com (the guild lead, 2026-11-15, option B: "the formatting we have on
// Wolfpack.quest is what we should be using here"). Two halves:
//   1. The data the header and side nav draw: every href is a raidmimic path or the project's GitHub releases, none spells the
//      Wolf Pack address, and the sections are raidmimic's own (lib/raidmimicNav.ts), not a second list.
//   2. The wiring, as text with comments stripped: HostFrame is the shell on a raidmimic host and a pass-through elsewhere,
//      and no cookie or ?v= picks it.
// Run: npx vitest run test/raidmimic-shell.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import { RAIDMIMIC_SECTIONS } from '../web/lib/raidmimicNav.ts';
import { RM_ABOUT, RM_DOWNLOADS, RM_HEADER_SECTIONS, shellSectionOf } from '../web/lib/raidmimicShell.ts';

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
    for (const rel of ['web/lib/raidmimicShell.ts', 'web/components/RaidmimicHeader.tsx',
      'web/components/RaidmimicSideShell.tsx', 'web/components/RaidmimicShell.tsx', 'web/components/RaidmimicShellFooter.tsx']) {
      expect(code(rel), rel).not.toMatch(WOLF);
    }
  });
});

describe('the frame', () => {
  it('HostFrame hands the page back untouched off a raidmimic host, and on one it is the shell (B), with no variant left', () => {
    const src = code('web/components/RaidmimicFrame.tsx');
    const frame = src.slice(src.indexOf('export default function HostFrame'));
    expect(frame.indexOf('if (!onHost) return <>{children}</>;')).toBeGreaterThan(0);
    expect(frame).toContain('return <ShellFrame>{children}</ShellFrame>;');
    expect(src).not.toMatch(/HostBar|currentShell|rm_shell/);
  });

  it('the shell is the header, the side nav and the footer, and nothing reads a cookie or a ?v= to pick it', () => {
    const src = code('web/components/RaidmimicShell.tsx');
    for (const part of ['<RaidmimicHeader', '<RaidmimicSideShell>', '<RaidmimicShellFooter />']) expect(src).toContain(part);
    expect(src).not.toMatch(/cookies\(|headers\(|rm_shell|variant/);
    expect(code('web/components/RaidmimicHeader.tsx')).not.toMatch(/variant|TabRow/);
    expect(fs.existsSync(path.join(ROOT, 'web/lib/raidmimicShellVariant.ts'))).toBe(false);
  });

  it('the middleware has no shell preview left (no cookie, no ?v= redirect)', () => {
    expect(code('web/middleware.ts')).not.toMatch(/rm_shell|RM_SHELL|rmShell/);
  });

  it('the landing page, the set-up guide and the legal pages sit in the same frame, on a raidmimic host', () => {
    for (const rel of ['web/app/raidmimic/page.tsx', 'web/app/raidmimic/setup/page.tsx']) {
      const src = code(rel);
      expect(src, rel).toContain("import HostFrame from '@/components/RaidmimicFrame';");
      expect(src, rel).toContain('<HostFrame onHost={onHost}>');
      expect(src, rel).not.toMatch(/HostBar/);
    }
    const legal = code('web/app/raidmimic/_legal/LegalParts.tsx');
    expect(legal).toContain('return onHost ? <ShellFrame>{page}</ShellFrame> : page;');
    expect(legal).toContain('{!onHost && <footer');
  });
});
