// raidmimic.com/privacy: what Raid Mimic keeps, in plain words. Rewritten 2026-11-15 (the guild lead: "privacy page needs
// updating with what it actually is"; "the site's pages are too wordy"): the first version was written for a guild-run
// service, and raidmimic.com today is mainly for individual players, with the guild side beside it. Served at
// raidmimic.com/privacy (the middleware rewrites /privacy here) and at wolfpack.quest/raidmimic/privacy. A NEW page, so it
// ships with the [beta] tag (CLAUDE.md, DECISIONS §135).
//
// RULE for editing it: say what the software does TODAY, checked in the code (the file or migration behind each claim is in
// a comment beside it), and say "coming" for what does not exist yet (payments). A promise goes in only once the code keeps
// it. Nothing on this page points at wolfpack.quest (test/raidmimic-no-wolfpack.test.js). Keep it a two-minute read.
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { isRaidmimicHost, raidmimicSeo } from '@/lib/raidmimicHost';
import { CONTACT_EMAIL, CONTACT_HREF, LEGAL_META, MIN_AGE, PRIVACY_UPDATED, YOUR_DATA_PATH, legalPaths } from '@/lib/legal';
import { REPO_URL } from '@/lib/raidmimicLanding';
import { B, Bullets, LEGAL_LINK, LegalShell, Rows, Section } from '../_legal/LegalParts';

export function generateMetadata(): Metadata {
  const { title, description } = LEGAL_META.privacy;
  return {
    title: { absolute: title },
    description,
    ...raidmimicSeo(headers().get('host'), '/privacy'),
    openGraph: { title, description, siteName: 'Raid Mimic', type: 'website' },
    twitter: { card: 'summary' },
  };
}

const EXT = { target: '_blank', rel: 'noreferrer' } as const;

type Row = [what: string, holds: string, kept: string];
const rows = (list: Row[]) => list.map(([what, holds, kept]) => ({
  head: <><B>{what}</B><div className="text-xs text-dim">{holds}</div></>,
  body: kept,
}));

// What is kept about a signed-in player. Each line is checked against the code named beside it.
const YOURS: Row[] = [
  // web/lib/openSignIn.ts (hub_players upsert: discord id, display name, avatar, last_seen_at); supabase/migrations/20261115230100 (anonymised on delete)
  ['Your account', 'Your Discord id, display name and avatar, when you joined and when you last came by',
    'Until you delete your account. The row then stays as “Deleted player”, with no avatar, because guilds and invites point at it.'],
  // web/lib/hubRegistry.ts SCOPES_OPEN = 'identify'; web/middleware.ts page_views insert (signed-in GETs only)
  ['Sign-in and page views', 'A sign-in cookie. Our sign-in provider keeps each session’s IP address and browser type. While you are signed in, each page you open is logged: the page, where you came from, your browser',
    'Until you delete your account (the archive keeps its own copy of page views, see below)'],
  // web/lib/termsAcceptance.ts + migration 20261101130000_terms_acceptances (user_id, discord_id, terms_version, accepted_at, host); not in member_self_delete
  ['Terms record', 'Which version of the terms you signed in under, when, on which site, with your Discord id',
    'Kept, even after you delete your account, as the record of what you agreed to'],
  // web/lib/hubImport.ts, popFlagsPaste.ts, hubClaim.ts, app/characters/actions.ts removeCharacter; migrations 20261102210000_hub_sync, 20261115140000
  ['Characters and PoP flags', 'Names you load (letters only), whether each is claimed, contested or proven, and the flags you earned, from a PoPFlags file, a pasted #popflags or Seer text, or Mimic. Only flags on our list are stored; other lines are dropped and the paste is never kept',
    'Until you press Remove on the character, or delete your account'],
  // web/lib/hubInventory.ts (parseQuarmy drops bank, shared bank, coin, cursor), hubInventoryDb.ts replaceRows; migration 20261115230000_hub_inventory
  ['Inventory', 'Item name, id, slot and count from a Zeal inventory file (bags, worn items and bank) or a Quarmy file (worn items and bags only: no bank, coin or cursor)',
    'Until you upload a newer file for that character, press Remove, or delete your account'],
  // web/lib/myRaids.ts; migration 20261115140000_hub_player_guilds (hub_player_guilds, hub_player_targets)
  ['My raids', 'The guilds you list, your raid days and times, and the target you set for each raid day',
    'Until you change it, or delete your account'],
  // web/app/guilds/actions.ts, hubGuildsLoad.ts; migration 20261023160000_open_hub_registry (hub_memberships, hub_player_activity)
  ['Guild membership', 'Which guilds you belong to, your role, when you joined or left, and one mark for each day a Mimic linked to a guild sent it something',
    'The day marks go when you delete your account. You leave every guild then; the record that you once belonged stays, with no name.'],
  // utils/mimicLink.js (mimic_sessions: machine_label, agent_version, last_used_at); member_self_delete deletes mimic_sessions + mimic_link_codes
  ['Your Mimic link', 'Which PC linked (a label), the Mimic version, and when it last connected',
    'Until you delete your account. Disconnect in Mimic stops it working at once.'],
  // migration 20261115120000_hub_import_attempts + 20261110140000_hub_invite_attempts; index.js midnight sweeps "older than 1 day"
  ['Spam limits', 'One row per import (your id and the time), and one per wrong invite code (your id and a one-way scramble of your network address)',
    '1 day'],
];

// Guild records. Each line is checked against the bot's own clean-up (index.js midnight chain) and utils/raidHistory.js.
const GUILD_KEPT: Row[] = [
  ['Fight totals', 'Damage, heals and deaths per player', 'Kept'],
  // index.js "compacted contributions.raw_parse older than 7 days"
  ['Per-hit parse detail', '', '7 days'],
  // index.js BUFF_CASTS_RETENTION_DAYS default 7
  ['Buffs and debuffs seen landing', '', '7 days'],
  // index.js THREAT_SNAPSHOT_RETENTION_DAYS default 30; thin_threat_snapshots after 7 days
  ['Threat snapshots', '', '30 days (after 7, thinned to one a minute)'],
  // index.js XP_EVENTS_RETENTION_DAYS default 30
  ['Experience gained', 'With your group’s names', '30 days'],
  // index.js WHO_OBS_RETENTION_DAYS default 60
  ['/who sightings', '', '60 days, plus the latest sighting of each character'],
  // utils/raidHistory.js RETENTION_DAYS = 60
  ['Raid history', 'Mobs seen, mob HP, casts, zone changes, pet owners, trigger fires', '60 days'],
  // index.js TARGET_OBSERVATION_RETENTION_DAYS default 1; RAID_ROSTER_RETENTION_HOURS default 1
  ['Who targeted what', '', '1 day'],
  ['Live raid roster with positions', '', '1 hour'],
  // index.js RAID_TRACK_RETENTION_DAYS default 0 (off)
  ['Raid positions kept for replay', '', 'No deletion date'],
  // apps/bristlebane/README.md "Recording is opt-in only"
  ['Raid voice recordings', 'Only members who opted in', 'Until the member opts out for tonight or asks to be forgotten'],
];

const PROCESSORS: [string, string, string][] = [
  ['Supabase', 'The database and the sign-in', 'Everything stored for the service'],
  ['Vercel', 'Hosts the website', 'The pages you view'],
  ['Railway', 'Runs the upload server, the party service and the Discord bot', 'What Mimic uploads passes through; the party service keeps nothing'],
  ['Discord', 'Sign-in, and the guild bot', 'Your Discord id, name and avatar; whatever a guild has the bot post'],
  ['GitHub', 'The code, Mimic downloads and updates', 'Downloads'],
  ['Public time servers', 'Keep Mimic’s clock right', 'Your IP address'],
  ['A server the Raid Mimic team runs', 'Nightly backups, and an archive', 'A full copy of the database, kept 30 days. The archive is a permanent copy of Wolf Pack’s guild records (chat, tells, fights, page views)'],
  ['Anthropic (Claude AI coding assistants)', 'Building and fixing the platform', 'Those sessions can query the database, private data included, while they work'],
];

// Only when a guild connects them (the Wolf Pack bot's connections; the bot code is utils/opendkp.js, voice.js, raid-helper in index.js).
const IF_CONNECTED: [string, string, string][] = [
  ['OpenDKP (on Amazon Web Services)', 'The guild’s DKP system', 'Character names, attendance, auctions and bids'],
  ['Raid-Helper', 'Raid sign-ups', 'Discord id, name, class, notes'],
  ['Microsoft', 'Turns callout text into speech for the Discord voice channel', 'The callout text, which can name a player'],
];

export default function RaidmimicPrivacyPage() {
  const onHost = isRaidmimicHost(headers().get('host'));
  const p = legalPaths(onHost);
  return (
    <LegalShell onHost={onHost} title="Privacy, in plain words" updated={PRIVACY_UPDATED}
      lead="What Raid Mimic keeps about you, who else handles it, and how to take it or delete it.">
      <Section title="The short version">
        <Bullets>
          <li>You sign in with <B>Discord</B>. On this site we ask it for your id, name and avatar. Not your email. Your server list only if you press Find my guilds or Confirm my server, and we do not store it.</li>
          <li>Your characters, flags, items and raid plans are <B>yours alone</B>. Other players cannot see them.</li>
          <li><B>No ads, no selling, no tracking scripts.</B></li>
          <li><B>Nothing you upload is ever used to train AI models.</B></li>
          <li><B>Download and delete it yourself:</B> <a href={YOUR_DATA_PATH} className={LEGAL_LINK}>Your data</a>.</li>
          <li>Not for children under {MIN_AGE}.</li>
        </Bullets>
      </Section>

      <Section title="Who runs it">
        <p>
          The Raid Mimic team (“we”), a fan project, open source under the AGPL-3.0-or-later licence. <a href={REPO_URL} {...EXT} className={LEGAL_LINK}>Every
          line is public</a>, so anything here can be checked. Questions: <a href={CONTACT_HREF} className={LEGAL_LINK}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section title="What we keep about you, and for how long">
        <Rows rows={rows(YOURS)} />
        <p>
          <B>The sign-up form for a guild</B> (no sign-in) keeps what you type, plus a one-way scramble of your network address for a
          day. <B>Anonymous feedback</B> on eqmimic.quest keeps your message, a Discord name only if you leave one, your Mimic
          version and system, and the same one-day scramble. People read both; nothing acts on them by itself. Neither has a deletion date: write to us and we remove it.
        </p>
      </Section>

      <Section title="Who can see it">
        <Bullets>
          <li><B>You</B>, all of it, on My characters and My raids.</li>
          <li><B>Other players:</B> none of it. A guild page shows its members only a head count.</li>
          <li>
            <B>Our officers:</B> only one page shows them player details, the contested-names page. When two or more players load the
            same character name, it lists each holder’s Discord id and display name and how many flags each has, so the name can be settled.
          </li>
          <li><B>A guild’s owner and officers</B> see the guild’s own settings and invite codes.</li>
          <li><B>The team</B> can read the database to fix a problem. Nothing is sold or shared for any other purpose.</li>
        </Bullets>
      </Section>

      <Section title="Mimic, the desktop app">
        <Bullets>
          {/* utils/mimicLink.js hubRouteAllowed / FREE_ROUTES: a player link may call only poll, latest-version, pop_flags and the link routes */}
          <li>
            <B>What leaves your PC when you link Mimic to your Raid Mimic account:</B> your PoP flags and the character name they belong to,
            plus update checks. Everything else Mimic could send is refused by our server before it is read.
          </li>
          {/* packages/wolfpack-logsync/index.js shouldKeep + DEFAULT_DROP_PATTERNS; docs/PRIVACY.md */}
          <li>Officer chat, group chat, custom channels, <code>/say</code>, OOC, shouts, auctions and tells are dropped on your PC first.</li>
          {/* apps/mimic/main.js _localVersionsRoot (userData/char-versions, newest 10); the agent's server.listen(port, '127.0.0.1') */}
          <li>
            <B>Stays on your PC:</B> your game logs, Mimic’s upload queue, its last 10 copies of each character’s UI files (in Mimic’s
            app-data folder) and the Inventory view, which Mimic serves only to your own computer.
          </li>
          <li><B>Disconnect</B> in Mimic stops everything going to our server. It does not delete what is stored; <a href={YOUR_DATA_PATH} className={LEGAL_LINK}>Your data</a> does.</li>
        </Bullets>
      </Section>

      <Section title="Party sharing (off until you turn it on)">
        {/* apps/raidmimic-relay/lib.js validatePub, SAMPLE_TTL_MS 30 s, HISTORY_SPAN_MS 20 min, PARTY_GRACE_MS 15 min, TIMER_MAX_MS charm 3 h; index.js (memory only, rpc.owns, startTrial);
            migration 20261115190000_relay_character_owner (relay_owns_character) */}
        <Bullets>
          <li>
            Mimic sends your party service your overlay numbers, your target, what you are casting, your group and raid names with their
            HP, trigger callouts and your buff, debuff and charm timers. Players whose party code you share, or whose group or raid
            lists include you, see them.
          </li>
          <li>
            <B>The numbers live in memory only</B> and are never written anywhere. A member’s numbers count for 30 seconds, about 20 minutes of
            history is kept, a charm timer can run to 3 hours, and an empty party is dropped after 15 minutes. A restart empties it.
          </li>
          <li>The service checks the character is yours with a read-only lookup. The first time you create a party it also records when your 14-day trial started. That date stays with your account after a delete, with no name.</li>
        </Bullets>
      </Section>

      <Section title="If your guild runs on Raid Mimic">
        {/* web/app/guilds/new/actions.ts (hub_guilds), guildSettings.ts, utils/mimicLink.js PAID_HUB_ROUTES (encounter = a managed plan's) */}
        <Bullets>
          <li>
            <B>The guild</B> keeps its name, its optional website and Discord server id, its raid schedule and settings, its invite codes and
            who belongs, with their roles. Owners hand a guild over before they can delete their account.
          </li>
          <li>
            <B>What members’ Mimic sends a guild:</B> PoP flags on every plan; on a Pro guild also its fights (damage, heals and deaths for
            everyone in them, pets included). Pro billing is <B>coming</B>; nothing is charged today.
          </li>
          <li>
            <B>Other raiders’ Mimic records you.</B> Even if you never install Mimic, raiders who run it record what their game shows them:
            your damage, heals and deaths in fights they are in, and, for Wolf Pack’s own raiders, also guild and raid chat, your <code>/who</code> presence
            and your HP and position in a raid. Your own switches do not stop this, because the fight happened to everyone in it. Ask, and we remove it.
          </li>
          <li><B>A guild owns its raid records</B> and we hold them for it.</li>
        </Bullets>
        <Rows rows={rows(GUILD_KEPT)} />
        <p>
          The 7-, 30- and 60-day lines are what a clean-up job deletes every night. Backups are copied nightly and kept 30 days.
          Anything else a guild stores has no deletion date: it stays until the guild or you ask us to remove it. Anything posted to Discord stays there until someone deletes it in Discord.
        </p>
      </Section>

      <Section title="Who else handles it">
        <Rows rows={PROCESSORS.map(([who, why, gets]) => ({ head: <><B>{who}</B><div className="text-xs text-dim">{why}</div></>, body: gets }))} />
        <p>A guild that connects one of these also sends it what the connection needs:</p>
        <Rows rows={IF_CONNECTED.map(([who, why, gets]) => ({ head: <><B>{who}</B><div className="text-xs text-dim">{why}</div></>, body: gets }))} />
        <p>
          <B>Ko-fi.</B> A donation is handled by Ko-fi, not by us. We see only what Ko-fi shows us. <B>Payments for Pro are coming:</B> we will name the
          payment company here first, and we will never see or store your card number.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          One sign-in cookie (up to 400 days), and while you confirm a Discord server for a new guild, one 15-minute cookie. That is all. No
          advertising cookies, no analytics scripts, no third-party trackers. Your Discord avatar loads from Discord.
        </p>
      </Section>

      <Section title="Your controls">
        <Bullets>
          <li>
            <B>Download:</B> <a href={YOUR_DATA_PATH} className={LEGAL_LINK}>Your data</a> gives you a file of what we hold about you: account, guilds,
            characters, flags, items, raid plans, Mimic links and page views.
          </li>
          <li>
            <B>Remove one character:</B> the Remove button on its card deletes its flags, items and your claim on the name.
          </li>
          <li>
            <B>Delete everything:</B> on the same page. It removes your characters, flags, items, raid list, targets, day marks, Mimic links,
            page views and sign-in, takes you out of every guild, and replaces your name with “Deleted player”. What stays: the terms record, the
            nightly backups (30 days) and the archive’s copy of page views. Posts already in Discord have to be removed there.
          </li>
          <li>
            <B>Anything else</B>, or if you think a child under {MIN_AGE} has an account: <a href={CONTACT_HREF} className={LEGAL_LINK}>{CONTACT_EMAIL}</a>.
          </li>
        </Bullets>
      </Section>

      <Section title="Never used to train AI models">
        <p>
          We do not use what you upload to train AI models, and we do not give it to anyone to do so. The AI assistants we build with are
          tools for writing code, as noted above.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When this page changes in a way that matters, the date at the top changes with it. The page is in the{' '}
          <a href={REPO_URL} {...EXT} className={LEGAL_LINK}>public repository</a>, so every earlier version is too. The{' '}
          <a href={p.terms} className={LEGAL_LINK}>Terms</a> and <a href={p.refunds} className={LEGAL_LINK}>Refunds</a> pages sit beside this one.
        </p>
      </Section>
    </LegalShell>
  );
}
