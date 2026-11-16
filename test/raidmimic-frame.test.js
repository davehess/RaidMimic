// test/raidmimic-frame.test.js — every raidmimic.com page carries the Raid Mimic header and footer (the guild lead, 2026-11-02, on
// raidmimic.com/guilds: "This looks like it's hard-tied to wolfpack here. And we're missing the whole header and privacy policy
// and whatnot at the bottom of the page"). The root layout gives a raidmimic host a bare shell, so each page brings its own:
// web/components/RaidmimicFrame.tsx for the pages that had none.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, stripJs } from './_source-slice.js';
import { GUILDS_STAY_PATH } from '../web/lib/guildSites.ts';

const code = (rel) => stripJs(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

describe('the Raid Mimic frame', () => {
  const frame = code('web/components/RaidmimicFrame.tsx');
  it('is the shell on a raidmimic host (Wolf Pack header, side nav, footer) and nothing on a Wolf Pack host', () => {
    expect(frame).toMatch(/import ShellFrame from '@\/components\/RaidmimicShell';/);
    expect(frame).toMatch(/if \(!onHost\) return <>\{children\}<\/>;/);
    expect(frame).toMatch(/return <ShellFrame>\{children\}<\/ShellFrame>;/);
    expect(frame).not.toMatch(/['"]use client['"]/);
    // "Your guilds" means "manage my Raid Mimic account", so it carries stay=1 (2026-11-02, redirect by default): without it
    // a one-guild player would be bounced to their guild's site every time they pressed it. The menus draw it from the nav list.
    expect(code('web/lib/raidmimicNav.ts')).toMatch(/href: GUILDS_STAY_PATH/);
    expect(GUILDS_STAY_PATH).toBe('/guilds?stay=1');
    const shell = code('web/components/RaidmimicShell.tsx');
    expect(shell).toMatch(/<RaidmimicHeader/);
    expect(shell).toMatch(/<RaidmimicShellFooter \/>/);
    // the header is pinned and opaque (2026-11-02: "top bar on the raidmimic.com site doesn't lock")
    expect(code('web/components/RaidmimicHeader.tsx')).toMatch(/<header [^>]*className="sticky top-0 z-40 [^"]*\bbg-bg[^"]*"/);
    // the landing page takes the same frame (2026-11-15, rm-shell-landing): signed in or out, on a raidmimic host only
    const landing = code('web/app/raidmimic/page.tsx');
    expect(landing).toMatch(/import HostFrame from '@\/components\/RaidmimicFrame';/);
    expect(landing).toMatch(/<HostFrame onHost=\{onHost\}>/);
    expect(landing).toMatch(/\{!onHost && <Footer onHost=\{false\} \/>\}/);
  });

  it('wraps every raidmimic-host page that had no header or footer', () => {
    for (const f of ['web/app/guilds/page.tsx', 'web/app/guilds/new/page.tsx', 'web/app/guilds/[slug]/page.tsx', 'web/app/raidmimic/register/page.tsx']) {
      const src = code(f);
      expect(src, f).toMatch(/import HostFrame from '@\/components\/RaidmimicFrame';/);
      const opens = (src.match(/<HostFrame onHost=\{onHost\}>/g) || []).length;
      expect(opens, f).toBeGreaterThan(0);
      expect((src.match(/<\/HostFrame>/g) || []).length, f).toBe(opens);   // every return that opens it closes it
    }
    // /guilds/<slug> has two returns (a visitor's and a member's); both are framed
    expect((code('web/app/guilds/[slug]/page.tsx').match(/<HostFrame onHost=\{onHost\}>/g) || []).length).toBe(2);
    // the set-up guide takes the same frame; its own footer is the shell's on a raidmimic host
    const setup = code('web/app/raidmimic/setup/page.tsx');
    expect(setup).toMatch(/<HostFrame onHost=\{onHost\}>/);
    expect(setup).not.toMatch(/HostBar/);
  });

  it('/guilds: Wolf Pack\'s card reads like the others, and "Find my guilds" never says "none" beside a listed guild', () => {
    const page = code('web/app/guilds/page.tsx');
    // Wolf Pack's card opens the guild's configured site (guildSites.ts, never an address typed here); each hub card opens its page.
    expect(page).toMatch(/Open the guild&rsquo;s site &rarr;<\/a>[\s\S]*Open the guild &rarr;<\/a>/);
    expect(page).not.toMatch(/Open my page/);
    expect(page).toMatch(/findNote\(searchParams\.find, searchParams\.found, closed\.length, !!wolf \|\| hub\.length > 0\)/);
    // Wording from the guild lead, 2026-11-09: "No other guilds of yours have opted into Raid Mimic yet."
    expect(page).toMatch(/listed \? 'No other guilds of yours have opted into Raid Mimic yet\.' : 'None of your guilds have opted into Raid Mimic yet\.'/);
    expect(page).not.toMatch(/of your Discord servers is a guild/);
  });
});
