// raidmimic.com/security: how Raid Mimic protects your account and your guild's data, in plain words (the guild lead,
// 2026-11-15: "write up a security page in the same scheme as the privacy page"). Served at raidmimic.com/security (the
// middleware rewrites /security here) and at wolfpack.quest/raidmimic/security. A NEW page, so it ships with the [beta] tag
// (CLAUDE.md, DECISIONS §135).
//
// RULE for editing it, the same as the privacy page's: say what the software does TODAY, verified in the code (the file that
// backs each claim is cited in a comment beside it), and say "coming" for what does not exist yet. This page is PUBLIC, so it
// describes protections and never weaknesses or ways in: no open findings, no checks that only warn, no host names, addresses,
// ports, internal service names beyond the processors the privacy page already lists, variable names, table or function
// names, or limits precise enough to tune an attack ("rate-limited" is all it says). If a protection is only partly in place
// it is left out, or written as "coming" with no detail. test/raidmimic-security-page.test.js keeps those out.
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { isRaidmimicHost, raidmimicSeo } from '@/lib/raidmimicHost';
import { CONTACT_EMAIL, CONTACT_HREF, LEGAL_META, SECURITY_UPDATED, legalPaths } from '@/lib/legal';
import { REPO_URL } from '@/lib/raidmimicLanding';
import { B, Bullets, LEGAL_LINK, LegalShell, Rows, Section } from '../_legal/LegalParts';

export function generateMetadata(): Metadata {
  const { title, description } = LEGAL_META.security;
  return {
    title: { absolute: title },
    description,
    ...raidmimicSeo(headers().get('host'), '/security'),
    openGraph: { title, description, siteName: 'Raid Mimic', type: 'website' },
    twitter: { card: 'summary' },
  };
}

const EXT = { target: '_blank', rel: 'noreferrer' } as const;

// Who can see what. Backed by: web/lib/member.ts (the guild-member check on every request), web/lib/officer.ts (the officer
// check, the /admin pages), web/app/guilds/actions.ts (a guild's own roles), web/lib/hubImport.ts + supabase/migrations/
// 20261102210000_hub_sync.sql (a player's own flags are reachable only through server code keyed to the signed-in player).
const WHO_SEES: [string, string][] = [
  ['Anyone, signed in or not', 'The public pages: this one, the landing page, the set-up guide, the demo (an invented guild) and the legal pages.'],
  ['You', 'Your own account and your own characters, which you can download or delete yourself.'],
  ['A member of a guild', 'What that guild shows its members. Member pages check each time you open them that you are still a member.'],
  ['An officer', 'The officer pages. They are open only to people who hold an officer role, checked each time a page is opened.'],
];

export default function RaidmimicSecurityPage() {
  const onHost = isRaidmimicHost(headers().get('host'));
  const p = legalPaths(onHost);
  return (
    <LegalShell onHost={onHost} title="Security, in plain words" updated={SECURITY_UPDATED}
      lead="How Raid Mimic keeps your account and your guild’s data safe, what Mimic does on your own PC, and how to tell us about a problem.">
      <Section title="The short version">
        <Bullets>
          {/* web/lib/hubRegistry.ts signInScopes, web/app/auth/claim/page.tsx (a 404 on a raidmimic host): sign-in here is Discord only */}
          <li>You sign in to Raid Mimic with <B>Discord</B>. Raid Mimic keeps no password for you.</li>
          {/* web/lib/hubImport.ts, popFlagsPaste.ts: matched against a fixed list, never run */}
          <li>What you paste or upload is <B>matched against a fixed list and never run</B> as code.</li>
          {/* packages/wolfpack-logsync/index.js shouldKeep + DEFAULT_DROP_PATTERNS: dropped on the PC first */}
          <li>Private chat <B>is dropped on your PC</B> before Mimic sends anything.</li>
          {/* next.config.js headers (HSTS): the site is HTTPS only; agent default upload address is https */}
          <li>The website and Mimic’s uploads use <B>encrypted connections</B>.</li>
          {/* apps/raidmimic-relay/lib.js: memory only */}
          <li>The live party view <B>keeps nothing</B> on a disk.</li>
          {/* REPO_URL, package.json license */}
          <li>The code is <B>open source</B>, so anyone can check this page against it.</li>
        </Bullets>
        <p>
          Nothing here is a promise of perfect safety. It is a list of what the software does <B>today</B>, with{' '}
          <B>coming</B> marked where a thing does not exist yet.
        </p>
      </Section>

      <Section title="Signing in">
        <Bullets>
          {/* web/lib/hubRegistry.ts SCOPES_OPEN = 'identify'; signInScopes() */}
          <li>
            <B>Discord only.</B> On this site Discord shares who you are (your id, name and avatar) and nothing else: not your server
            list, and not your messages.
          </li>
          {/* web/lib/hubRegistry.ts FLOW_GUILDS / SCOPES_FIND_GUILDS: the second consent exists only for "Find my guilds" */}
          <li>
            <B>Find my guilds</B> is a second, separate Discord question that is asked only when you press it, so we can match your
            servers against the guilds registered here.
          </li>
          {/* web/lib/supabase-server.ts, web/middleware.ts: session in cookies, refreshed on each request; the middleware also
              expires the auth cookies on sign-out. HttpOnly is NOT claimed (CLAUDE.md, the 2026-09-25 audit). */}
          <li>
            Your sign-in is held in a cookie that the site refreshes while you use it. Signing out clears it.
          </li>
        </Bullets>
      </Section>

      <Section title="Your data in our database">
        <Bullets>
          {/* supabase/migrations/20261102210000_hub_sync.sql: RLS on, no grants to browser roles; web/lib/hubImport.ts */}
          <li>
            <B>Your own records are reached only through our server code, keyed to the account you signed in with.</B> The
            database refuses a direct request from a browser for them.
          </li>
          {/* 162 migrations enable row level security; the guild tables are authenticated-only (CLAUDE.md Supabase section, supabase/migrations) */}
          <li>
            <B>Guild data is behind the database’s own rules.</B> The guild tables are protected by row-level rules in the
            database itself, not only by the website.
          </li>
          {/* web/lib/member.ts: the membership flag is read on every request; web/lib/officer.ts */}
          <li>Every page that shows a guild’s data checks that you are a current member of that guild, each time you open it.</li>
          {/* utils/bidCrypto.js AES-256-GCM, index.js encryptBlob for ui_snapshots.payload_enc and personal trigger sync */}
          <li>
            <B>Encrypted again inside the database:</B> sealed DKP bids and the UI backups Mimic can make. They are stored as
            ciphertext, so reading the table does not show them.
          </li>
          {/* scripts/unraid-backup-supabase.sh: nightly dump, KEEP_DAYS=30 (the privacy page says the same) */}
          <li>
            <B>Backups.</B> The database is copied every night and the copies are kept for 30 days. The{' '}
            <a href={p.privacy} className={LEGAL_LINK}>privacy page</a> says where and what is in them.
          </li>
        </Bullets>
      </Section>

      <Section title="What you upload to the website">
        <Bullets>
          {/* web/lib/popFlagsPaste.ts (line-by-line match against the catalog), hubImport.ts normalizeText + parse */}
          <li>
            Your PoP flags, whether pasted or loaded from a file, are <B>matched line by line against a fixed list</B>. Only the
            flags it recognises are stored. Anything else in the text is thrown away.
          </li>
          {/* web/lib/hubImport.ts MAX_FILE_BYTES / MAX_PASTE_BYTES / MAX_FILES_PER_UPLOAD / NAME_RX */}
          <li>There are <B>size and count limits</B> on files, pastes and characters, and a character name must be plain letters.</li>
          {/* hubImport.ts and popFlagsPaste.ts read text only: no eval, no HTML insertion (grep) */}
          <li>An upload is read as text. It is <B>never run</B> and never inserted into a page as code.</li>
          {/* web/lib/hubImportLimit.ts + app/characters/actions.ts; invite guesses limited in app/guilds/actions.ts */}
          <li>Imports and invite-code guesses are <B>rate-limited</B>.</li>
        </Bullets>
      </Section>

      <Section title="Mimic on your PC">
        <Bullets>
          {/* packages/wolfpack-logsync/index.js shouldKeep / DEFAULT_DROP_PATTERNS; docs/PRIVACY.md */}
          <li>
            Mimic reads your EverQuest log and Zeal’s live data <B>on your PC</B>. Officer chat, group chat, custom channels,
            <code> /say</code>, OOC, shouts and auctions are dropped there first. Tells are dropped too, unless you turn tell relay on.
          </li>
          {/* packages/wolfpack-logsync/index.js DEFAULT_BOT_URL is https; a failed send is retried from a local queue */}
          <li>What Mimic does send goes over an <B>encrypted connection</B>.</li>
          {/* packages/wolfpack-logsync/index.js: server.listen(port, '127.0.0.1') */}
          <li>
            Mimic’s own control page listens <B>only on your own computer</B>. Other machines on your network cannot open it.
          </li>
          {/* apps/mimic/main.js _encryptSecret: safeStorage (DPAPI on Windows, Keychain on macOS) */}
          <li>
            Mimic keeps its sign-in token in your operating system’s protected storage where your system provides it, so a copied
            settings file is not enough to use it elsewhere.
          </li>
          {/* apps/mimic/package.json build.publish provider github; main.js electron-updater */}
          <li>
            <B>Updates</B> come from Mimic’s releases on GitHub, through the standard Electron updater.
          </li>
          {/* docs/code-signing.md STATUS 2026-10-29: pipeline ready, nothing signed yet */}
          <li>
            <B>The installers are not code-signed today.</B> That is why Windows may warn you when you run one. Signing is{' '}
            <B>coming</B> once a signing account is in place. Until then, download Mimic only from the link on this site or from the{' '}
            <a href={REPO_URL} {...EXT} className={LEGAL_LINK}>public repository</a>.
          </li>
        </Bullets>
      </Section>

      <Section title="The live party view">
        <Bullets>
          {/* apps/raidmimic-relay/lib.js (autoMode mutual rule), docs/DESIGN-raidmimic-relay.md "Auto mode and ownership" */}
          <li>
            Mimic shares live numbers <B>only between players whose game group or raid lists each other</B>. Writing someone’s name
            into your own list gets you nothing.
          </li>
          {/* apps/raidmimic-relay/index.js: every hello checked with rpc.owns; not_your_character */}
          <li>The character you share as <B>must belong to your account</B>. It is checked each time you connect.</li>
          {/* apps/raidmimic-relay/lib.js: in-memory maps, HISTORY_SPAN_MS = 20 min; no fs writes */}
          <li><B>Nothing is stored.</B> It lives in memory only, for about 20 minutes, and a restart empties it.</li>
          {/* apps/raidmimic-relay/index.js line 20 env: only the anon key; lib.js comment: SECURITY DEFINER RPCs */}
          <li>The party service holds <B>no key that can read a guild’s data</B>. It can only ask who a sign-in belongs to.</li>
          {/* apps/raidmimic-relay/lib.js validation + failed-hello limiter */}
          <li>Every message is checked, malformed ones are dropped, and failed attempts are <B>rate-limited</B>.</li>
        </Bullets>
      </Section>

      <Section title="Who can see what">
        <Rows rows={WHO_SEES.map(([who, what]) => ({ head: <B>{who}</B>, body: what }))} />
      </Section>

      <Section title="The website itself">
        <Bullets>
          {/* web/next.config.js security headers: HSTS, frame-ancestors self, nosniff, referrer policy */}
          <li>The site tells browsers to <B>use only encrypted connections</B>, not to let other sites frame its pages, and to send
            little about where you came from when you follow a link out.</li>
        </Bullets>
      </Section>

      <Section title="Open source">
        <p>
          {/* package.json license AGPL-3.0-or-later; REPO_URL */}
          Raid Mimic is open source under the AGPL-3.0-or-later licence.{' '}
          <a href={REPO_URL} {...EXT} className={LEGAL_LINK}>Every line is public</a>, so anyone can check what is written on
          this page, and look for a problem we missed.
        </p>
      </Section>

      <Section title="Reporting a security problem">
        <Bullets>
          {/* web/lib/legal.ts CONTACT_EMAIL / CONTACT_HREF: the one contact address */}
          <li>Write to <a href={CONTACT_HREF} className={LEGAL_LINK}>{CONTACT_EMAIL}</a> and say what you found and how to see it.</li>
          <li><B>Please keep the details private</B> until it is fixed: do not post them in Discord or on a public issue.</li>
          <li>Please do not touch other people’s data, and stop when you have shown the problem.</li>
          <li>We will read it, reply, fix it as soon as we can, and credit you if you want that. This is a fan project run by
            volunteers, so we make no promise about how fast.</li>
        </Bullets>
      </Section>

      <Section title="Changes">
        <p>
          When this page changes in a way that matters, the date at the top changes with it. The page is in the{' '}
          <a href={REPO_URL} {...EXT} className={LEGAL_LINK}>public repository</a>, so every earlier version is too. The{' '}
          <a href={p.privacy} className={LEGAL_LINK}>Privacy</a> page sits beside this one.
        </p>
      </Section>
    </LegalShell>
  );
}
