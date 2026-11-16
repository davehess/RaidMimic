// test/raidmimic-security-page.test.js — raidmimic.com/security (the guild lead, 2026-11-15: "write up a security page in the
// same scheme as the privacy page").
//
// The page is PUBLIC, so the rule here is the mirror of the privacy page's: it says what the software does today, and it
// describes protections, never weaknesses or ways in. What is pinned:
//   - the page exists, is a server component, uses LegalShell, names itself ([beta], the tab and the Discord card) and links
//     the one contact address from web/lib/legal.ts;
//   - it is served on the raidmimic hosts, listed in the sitemap, and linked from the shared footer beside Privacy;
//   - what it must NOT show: an IPv4 address, a port, an UPPER_SNAKE variable name, a table name the migrations create, a
//     host name, "HttpOnly" (never verified), or a claim that Mimic's own control page is reachable from elsewhere.
//
// Source text is read COMMENT-STRIPPED (CLAUDE.md "comments satisfy text assertions"); the page cites its backing files in
// comments, and those comments name variables and tables on purpose, so every assertion about what a visitor reads runs over
// the visible text only (JSX and line comments removed, tags removed).
//
// Run: npx vitest run test/raidmimic-security-page.test.js

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import * as L from '../web/lib/legal.ts';
import { metaForPath } from '../web/lib/pageMeta.ts';
import { raidmimicLandingTarget, raidmimicSeo } from '../web/lib/raidmimicHost.ts';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'web/app/raidmimic/security/page.tsx';

// What a visitor reads: no /* */ blocks (JSX comments included), no whole-line // comments, no tags, no JS punctuation noise.
function visibleText() {
  const src = stripJs(read(PAGE).replace(/\{\/\*[\s\S]*?\*\/\}/g, ''));
  const body = src.slice(src.indexOf('<LegalShell'));
  return body.replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ');
}
// The page's string literals as well (the WHO_SEES rows live outside the JSX).
function literals() {
  const src = stripJs(read(PAGE).replace(/\{\/\*[\s\S]*?\*\/\}/g, ''));
  return [...src.matchAll(/'([^'\n]{12,})'/g)].map(m => m[1]).join(' ');
}
const everythingShown = () => `${visibleText()} ${literals()}`;

describe('the page', () => {
  const src = stripJs(read(PAGE));
  it('exists, is a server component, names itself from the shared words and uses the shared frame', () => {
    expect(fs.existsSync(path.join(ROOT, PAGE))).toBe(true);
    expect(src).not.toMatch(/['"]use client['"]/);
    expect(src).toMatch(/export function generateMetadata\(\)/);
    expect(src).toMatch(/LEGAL_META\.security/);
    expect(src).toMatch(/raidmimicSeo\(headers\(\)\.get\('host'\), '\/security'\)/);
    expect(src).toMatch(/<LegalShell\b/);
    expect(src).toMatch(/title="Security, in plain words"/);
    expect(src).toMatch(/from '\.\.\/_legal\/LegalParts'/);
    for (const part of ['Section', 'Bullets', 'Rows']) expect(src, part).toMatch(new RegExp(`<${part}\\b`));
  });
  it('carries the [beta] marker: in its title and card, and through the shared frame (NewPageTag)', () => {
    expect(L.LEGAL_META.security.title).toBe('[beta] Raid Mimic security');
    expect(read('web/app/raidmimic/_legal/LegalParts.tsx')).toMatch(/<NewPageTag\b/);
  });
  it('links the one contact address from lib/legal.ts and hard-codes no address of its own', () => {
    expect(src).toMatch(/href=\{CONTACT_HREF\}/);
    expect(src).toMatch(/\{CONTACT_EMAIL\}/);
    expect(src).not.toMatch(/@raidmimic\.com|mailto:/);
    expect(L.CONTACT_HREF).toBe('mailto:hello@raidmimic.com');
  });
  it('has its own date, and every section the guild lead asked for', () => {
    expect(src).toMatch(/updated=\{SECURITY_UPDATED\}/);
    expect(L.SECURITY_UPDATED).toBe('November 15, 2026');
    for (const h of ['The short version', 'Signing in', 'Your data in our database', 'What you upload to the website', 'Mimic on your PC',
      'The live party view', 'Who can see what', 'Open source', 'Reporting a security problem', 'Changes']) expect(src, h).toContain(`title="${h}"`);
  });
  it('says plainly that the installers are unsigned and that signing is coming', () => {
    const t = everythingShown();
    expect(t).toMatch(/installers are not code-signed today/);
    expect(t).toMatch(/Signing is\s+coming/);
  });
  it('keeps the promises it can keep: private chat dropped on the PC, the control page on the PC only, nothing stored by the party view', () => {
    const t = everythingShown();
    expect(t).toMatch(/dropped there first/);
    expect(t).toMatch(/only on your own computer/);
    // The relay writes one row of its own (the trial start), so the promise is about what is SHARED.
    expect(t).toMatch(/What you share is never stored/);
    expect(t).toMatch(/must belong to your account/);
  });
  it('the agent really binds 127.0.0.1 only (the claim above rests on this, so it is checked, not trusted)', () => {
    const agent = stripJs(read('packages/wolfpack-logsync/index.js'));
    expect(agent).toMatch(/server\.listen\(port, '127\.0\.0\.1'/);
    expect(agent).not.toMatch(/server\.listen\(port, '0\.0\.0\.0'/);
  });
});

describe('what a public security page must never show', () => {
  const t = () => everythingShown();
  it('no IPv4 address and no port', () => {
    expect(t()).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(t()).not.toMatch(/localhost:|127\.0\.0\.1|:\d{2,5}\b/i);
  });
  it('no UPPER_SNAKE variable names', () => {
    expect(t()).not.toMatch(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/);
  });
  it('no table name the migrations create (underscored names anywhere; plain words only when written as code)', () => {
    const names = new Set();
    const dir = path.join(ROOT, 'supabase/migrations');
    for (const f of fs.readdirSync(dir)) {
      for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) names.add(m[1].toLowerCase());
    }
    expect(names.size).toBeGreaterThan(100);   // the scan itself works
    const shown = t().toLowerCase();
    const asCode = [...stripJs(read(PAGE)).matchAll(/<code>([^<]*)<\/code>/g)].map(m => m[1].toLowerCase());
    for (const n of names) {
      if (n.includes('_')) expect(shown, n).not.toContain(n);
      else expect(asCode, n).not.toContain(n);
    }
  });
  it('no host or service address, no function-style names, no "HttpOnly" (never verified), no mention of a weakness', () => {
    expect(t()).not.toMatch(/https?:\/\/|\.railway\.app|\.supabase\.co|\.vercel\.app|wolfpack\.quest/i);
    expect(t()).not.toMatch(/\b\w+_\w+\(|\w+\(\)/);
    expect(t()).not.toMatch(/httponly/i);
    expect(t()).not.toMatch(/report-only|warn mode|vulnerab|exploit|unpatched|known issue|audit finding/i);
  });
  it('the limits are never quoted as numbers (it says "rate-limited" and "limits", nothing tunable)', () => {
    const rate = t().match(/[^.]*rate-limited[^.]*\./gi) || [];
    expect(rate.length).toBeGreaterThan(0);
    for (const s of rate) expect(s, s).not.toMatch(/\d/);
    expect(t()).not.toMatch(/\b\d+\s*(?:KB|MB|files|per hour|an hour|per minute|attempts)\b/i);
  });
  it('nothing on it names a person (the guild lead\'s attribution rule: roles only)', () => {
    expect(t()).not.toMatch(/\bHitya\b/);
  });
});

describe('wiring', () => {
  it('the Discord card names it with the same words as the tab', () => {
    const m = metaForPath('/raidmimic/security');
    expect(m.title).toBe(L.LEGAL_META.security.title);
    expect(m.description).toBe(L.LEGAL_META.security.description);
  });
  it('is served at /security on the raidmimic hosts and at /raidmimic/security elsewhere', () => {
    expect(raidmimicLandingTarget('/security')).toEqual({ pathname: '/raidmimic/security', search: '' });
    expect(raidmimicLandingTarget('/Security/')).toEqual({ pathname: '/raidmimic/security', search: '' });
    expect(raidmimicLandingTarget('/security/x').pathname).toBe('/raidmimic');
    expect(L.legalPaths(true).security).toBe('/security');
    expect(L.legalPaths(false).security).toBe('/raidmimic/security');
  });
  it('indexed on raidmimic.com with it as canonical, noindex elsewhere', () => {
    expect(raidmimicSeo('raidmimic.com', '/security')).toEqual({ robots: { index: true, follow: true }, alternates: { canonical: 'https://raidmimic.com/security' } });
    expect(raidmimicSeo('wolfpack.quest', '/security')).toEqual({ robots: { index: false, follow: false } });
  });
  it('the footer row carries Security beside Privacy, from the shared component', () => {
    expect(stripJs(read('web/components/LegalLinks.tsx'))).toMatch(/\['Privacy', p\.privacy\], \['Security', p\.security\], \['Terms'/);
  });
  it('another guild\'s address sends /security to the platform, like the other legal pages', async () => {
    const { otherGuildHostRedirect } = await import('../web/lib/guildHost.ts');
    expect(otherGuildHostRedirect('wolfpack', '/security')).toBe('https://raidmimic.com/security');
  });
  it('the sitemap lists it', async () => {
    const xml = await (await import('../web/app/raidmimic/sitemap.xml/route.ts')).GET().text();
    expect(xml).toContain('<loc>https://raidmimic.com/security</loc>');
  });
});
