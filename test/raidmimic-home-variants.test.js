// test/raidmimic-home-variants.test.js — the player-first drafts of the raidmimic.com landing (the guild lead, 2026-11-15: "the pages
// should be user focused and less on the guild leaders at the top"). What this pins:
//   - the default render is unchanged: page.tsx still returns its own page with no query read, and the drafts are mounted on a
//     beta build only, around that page (production never carries them),
//   - each ?v= value picks its own component, anything else falls through to the default,
//   - the middleware keeps ?v= on b.raidmimic.com's landing and nowhere else,
//   - A: the player nav and the "Running a guild?" divider; B: two doors and a bar of logo + Sign in; C: the paste box,
//   - the drafts stay token-only (no hex) and carry the "[draft] option X" strip.
// Source-text assertions run over comment-stripped source (CLAUDE.md "comments satisfy text assertions").
// Run: npx vitest run test/raidmimic-home-variants.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import * as R from '../web/lib/lab/fixtures/rm-home.ts';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => stripJs(read(rel));
const D = 'web/components/lab/rm-home/';

describe('the default render is unchanged', () => {
  const page = code('web/app/raidmimic/page.tsx');
  it('page.tsx still builds the same page and reads no query', () => {
    expect(page).toMatch(/const page = \(\s*<div id="raidmimic-home">/);
    expect(page).toMatch(/\{!signedIn && onHost && <HostBar \/>\}\s*<FeatureBlocks \/>/);
    expect(page).not.toMatch(/searchParams/);
  });
  it('returns that page alone unless this is a beta build, and wraps it (never replaces it) on beta', () => {
    expect(page).toMatch(/if \(process\.env\.NEXT_PUBLIC_IS_BETA !== '1'\) return page;/);
    expect(page).toMatch(/<RmHomeSwitch a=\{<VariantA \{\.\.\.vp\} \/>\} b=\{<VariantB \{\.\.\.vp\} \/>\} c=\{<VariantC \{\.\.\.vp\} \/>\}>\{page\}<\/RmHomeSwitch>/);
  });
});

describe('each ?v= picks its component', () => {
  const sw = code(`${D}RmHomeSwitch.tsx`);
  it('reads ?v= on the client and falls back to the children for anything but a, b, c', () => {
    expect(sw).toMatch(/useSearchParams\(\)\?\.get\('v'\)/);
    expect(sw).toMatch(/if \(!isHomeVariant\(v\)\) return <>\{children\}<\/>;/);
    expect(sw).toMatch(/v === 'a' \? a : v === 'b' \? b : c/);
  });
  it('knows exactly three variants', () => {
    expect(R.HOME_VARIANTS).toEqual(['a', 'b', 'c']);
    for (const v of ['a', 'b', 'c']) expect(R.isHomeVariant(v)).toBe(true);
    for (const v of ['', 'd', 'default', 'A', null, undefined]) expect(R.isHomeVariant(v)).toBe(false);
  });
  it('each draft strip names its own letter', () => {
    const v = code(`${D}Variants.tsx`);
    expect(v).toMatch(/export function VariantA[\s\S]*?<DraftStrip current="a" \/>/);
    expect(v).toMatch(/export function VariantB[\s\S]*?<DraftStrip current="b" \/>/);
    expect(v).toMatch(/export function VariantC[\s\S]*?<DraftStrip current="c" \/>/);
    expect(code(`${D}parts.tsx`)).toMatch(/option \{current\.toUpperCase\(\)\}/);
    expect(code(`${D}parts.tsx`)).toMatch(/\[draft\]/);
  });
});

describe('the middleware keeps ?v= on the beta host only', () => {
  const mw = code('web/middleware.ts');
  it('guards on the beta host, the landing path and a known variant', () => {
    expect(mw).toMatch(/isRaidmimicBetaHost\(request\.headers\.get\('host'\)\) && to\.pathname === RAIDMIMIC_LANDING_PATH && isHomeVariant\(draft\)\) url\.search = `\?v=\$\{draft\}`/);
  });
});

describe('option A: Player home', () => {
  it('has the four player pages and one For-guild-leaders link at the far right', () => {
    expect(R.PLAYER_NAV.map(n => n.label)).toEqual(['Home', 'My raids', 'My characters', 'Guilds']);
    expect(R.LEADER_NAV.label).toBe('For guild leaders');
    const bar = code(`${D}VariantBar.tsx`);
    expect(bar).toMatch(/data-leader-link className=\{`\$\{LINK\} ml-auto`\}/);
  });
  it('moves the guild blocks under a "Running a guild?" divider, after the player blocks', () => {
    expect(R.LEADER_DIVIDER.title).toBe('Running a guild?');
    const a = code(`${D}Variants.tsx`).split('export function VariantB')[0];
    expect(a.indexOf('<PlayerGets />')).toBeGreaterThan(-1);
    expect(a.indexOf('<LeaderBlocks')).toBeGreaterThan(a.indexOf('<PlayerGets />'));
    expect(code(`${D}Variants.tsx`)).toMatch(/<LeaderDivider \/>\s*<RaidManagement \/>\s*<Pricing[^>]*\/>\s*<div className="mt-12"><CtaBand ctx=\{ctx\} \/><\/div>/);
  });
  it('leads with one primary Sign in with Discord', () => {
    expect(R.PLAYER_HERO.signIn).toBe('Sign in with Discord');
    expect(R.PLAYER_HERO.headline).toBe('Track your PoP flags and raids. Free.');
  });
  it('chips My raids as coming until that page lands', () => {
    expect(R.PLAYER_GETS.find(g => g.id === 'raids').soon).toMatch(/coming/);
  });
});

describe('option B: Two doors', () => {
  it('has two equal doors, each with its own list and a primary button', () => {
    expect(R.DOORS.raid.lines).toHaveLength(3);
    expect(R.DOORS.lead.lines).toHaveLength(3);
    const d = code(`${D}Doors.tsx`);
    expect(d).toMatch(/grid gap-4 md:grid-cols-2/);
    expect(d).toMatch(/data-door="raid"/);
    expect(d).toMatch(/data-door="lead"/);
  });
  it('opens only the chosen door and reads #raid / #lead', () => {
    const d = code(`${D}Doors.tsx`);
    expect(d).toMatch(/h === 'raid' \|\| h === 'lead'/);
    expect(d).toMatch(/\{open === 'raid' && /);
    expect(d).toMatch(/\{open === 'lead' && /);
  });
  it('shrinks the bar to the logo and one Sign in', () => {
    const v = code(`${D}Variants.tsx`);
    expect(v).toMatch(/<VariantHostBar kind="minimal"/);
    const bar = code(`${D}VariantBar.tsx`);
    expect(bar).toMatch(/kind === 'player' \?/);
  });
});

describe('option C: Tool first', () => {
  it('puts the paste box in the first section and keeps it in the tab only', () => {
    const v = code(`${D}Variants.tsx`).split('export function VariantC')[1];
    expect(v.indexOf('<ToolBox')).toBeLessThan(v.indexOf('<PlayerGets'));
    const t = code(`${D}ToolBox.tsx`);
    expect(t).toMatch(/sessionStorage\.setItem/);
    expect(t).not.toMatch(/fetch\(/);
  });
});

describe('the drafts use tokens, not hex', () => {
  it('no colour literal in any rm-home file', () => {
    for (const f of fs.readdirSync(path.join(ROOT, D))) expect(code(D + f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
