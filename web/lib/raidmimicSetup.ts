// The words of raidmimic.com/setup: how to set Mimic up for yourself when you are not in anyone's guild (the guild
// lead, 2026-10-21: "make a page on raidmimic.com for how to set up themselves"). Plain data, no JSX; the layout
// is web/app/raidmimic/setup/page.tsx and it carries no sentence of its own, so a fact is fixed in one place.
// test/raidmimic-setup.test.js reads this file as text and imports it.
//
// Written for a raider on a phone: plain words, one action per step. EverQuest terms are fine, code names are not.
//
// ⚠ The product name on this page is "Raid Mimic" (the page) and "Mimic" (the program). "Wolf Pack" appears ONCE,
// in CREDIT below, because the guild lead is weighing dropping it from the product name. Do not add it elsewhere.
// No Wolf Pack web address anywhere on this page (the guild lead, 2026-11-02): test/raidmimic-no-wolfpack.test.js.
// ⚠ This repo is PUBLIC: no member, no character, no address of anyone's PC.

import { REPO_URL } from './eqmimicLanding';

// ─── Where things live ──────────────────────────────────────────────────────────────────────────────
// The stable release itself: the plain releases list opens on a run of betas (the guild lead, 2026-10-30).
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
// The privacy page has no address here: it is the Raid Mimic page on every host, so the page fills the link from
// web/lib/legal.ts legalPaths() (/privacy on a raidmimic host, /raidmimic/privacy on the Wolf Pack hosts).
export const LANDING_PATH_ON_HOST = '/';                 // raidmimic.com/
export const LANDING_PATH_ON_WOLFPACK = '/raidmimic';    // the same page, on the Wolf Pack hosts

// ─── Header ─────────────────────────────────────────────────────────────────────────────────────────
export const TITLE = '[beta] Set up Raid Mimic';
export const DESCRIPTION =
  'A step-by-step guide to setting up Mimic on your own PC for EverQuest on Project Quarm, with no guild needed: what you need, what works on your own, and how to join a raid.';
export const BETA_NOTE = 'New page, a first draft, still being shaped.';

export const HERO = {
  kicker: 'Set up Raid Mimic',
  name: 'Set it up yourself',
  line: 'Overlays from the log EverQuest already writes. No guild or account needed.',
  fine: 'Six steps, about ten minutes.',
};

export const CREDIT = 'Made by the Wolf Pack guild on Project Quarm.';

// ─── The steps ──────────────────────────────────────────────────────────────────────────────────────
export interface Step {
  id: string;
  title: string;
  /** One plain sentence under the title. */
  lead: string;
  /** Short lines, each one thing to do or know. */
  items: string[];
  /** Optional link shown under the items. */
  link?: { label: string; href: string };
  /** Optional small-print note. */
  note?: string;
}

export const REQUIREMENTS = {
  title: 'What you need',
  items: [
    'A Windows PC.',
    'EverQuest on Project Quarm, with logging turned on. In the game, type /log on.',
    'Zeal is optional. A few overlays need it, and the guide says which.',
  ],
};

export const STEPS: Step[] = [
  {
    id: 'download',
    title: 'Download Mimic',
    lead: 'Newest release, Windows installer.',
    items: [
      'Download the Windows installer from the newest release and run it.',
      'It is not code-signed: if Windows shows a blue SmartScreen warning, click More info, then Run anyway.',
      'PQ Companion, GINA and EQLogParser can stay installed.',
    ],
    link: { label: 'Open the latest release', href: RELEASES_URL },
    note: 'Install Mimic outside your EverQuest folder. If Zeal is not found later, fix this first.',
  },
  {
    id: 'first-run',
    title: 'First run: stay on your own PC',
    lead: 'Pick “Run local-only”.',
    items: [
      'On the welcome screen pick Run local-only for now.',
      'In local mode everything stays on your PC. Nothing is sent to any server.',
      'Play. Mimic finds your character’s log by itself.',
    ],
    note: 'You can sign in to a guild later from Settings or the tray.',
  },
  {
    id: 'on-your-own',
    title: 'What works on your own',
    lead: 'Needs no one else.',
    items: [
      'Overlays: the DPS meter, triggers with spoken alerts, timers, and the Canvas.',
      'Inventory: On this PC, then Inventory. Type /outputfile inventory in the game first.',
      'My replay: with Zeal, plays your night back on the zone map.',
      'My parses: your own fights over a window you pick.',
      'Rebuild from my logs: fills in fights from before you installed Mimic.',
    ],
  },
  {
    id: 'join-a-raid',
    title: 'Joining someone else’s raid',
    lead: 'No guild account needed: a short code works.',
    items: [
      'Dashboard → On this PC → Join a raid with a code. Type the leader’s code; it works for 6 hours.',
      'Afterwards, save the raid file. It is yours to keep.',
      'Share it and merge it with others to see the night from every raider’s side.',
    ],
    note: 'No On this PC on your dashboard? Install the newest release.',
  },
  {
    id: 'for-a-guild',
    title: 'Running it for a guild',
    lead: 'A hosted hub gives a guild one shared picture.',
    items: [
      'Shared raid boards, flags and lockouts, loot, merged parses and the same overlays for everyone.',
      'The guild’s data is the guild’s. A player’s data is the player’s. Each member opts in; signing out stops uploads at once.',
      'Hosting for other guilds is not built yet. The landing page has a form to register interest.',
    ],
    link: { label: 'See what a guild gets and register interest', href: '' },   // filled in by the page: the address differs by host
  },
  {
    id: 'privacy',
    title: 'Privacy, in plain words',
    lead: 'Local mode stays on your PC.',
    items: [
      'Logs, chat, tells, inventory and replays never leave your PC.',
      'Nothing uploads until you join a guild’s server yourself, and even then private chat (officer, group, custom channels, say, OOC, shout, auction) is dropped on your PC first.',
      'A raid file you hand to someone is the only thing that leaves on purpose.',
      'Mimic checks GitHub for updates; no game data goes with it.',
      'No account to delete: uninstall Mimic and delete its folder.',
    ],
    link: { label: 'Read the full privacy page', href: '' },   // filled by the page (legalPaths): the address differs by host
  },
];

// ─── Troubleshooting ────────────────────────────────────────────────────────────────────────────────
export interface Fix { id: string; problem: string; fix: string; note?: string; code?: { label: string; text: string } }

// A community fix from players on the Project Quarm Discord, quoted as it was shared (the folder is a placeholder).
const EQ_DATES_SCRIPT = String.raw`$game = 'C:\Path\To\Quarm'
if (-not (Test-Path -LiteralPath "$game\eqgame.exe")) {
  "eqgame.exe not found in $game"
} else {
  Set-Location -LiteralPath $game
  $dir = ""
  cmd /c "dir /t:c /s /a-d 2>nul" | ForEach-Object {
    if ($_ -match '^ Directory of (.+)$') { $dir = $Matches[1] }
    elseif ($_ -match '^(?!\d)\S*\s+\d\d:\d\d(\s?[AP]M)?\s+[\d,]+\s+(.+)$') {
      $path = Join-Path $dir $Matches[2]
      try {
        [IO.File]::SetCreationTimeUtc($path, [DateTime]::UtcNow)
        "fixed:  $path"
      } catch { "FAILED: $path - $_" }
    }
  }
}`;
export const TROUBLESHOOTING = {
  title: 'If something does not work',
  list: [
    {
      id: 'zeal-not-found',
      problem: 'Mimic cannot find Zeal at all.',
      fix: 'Reinstall Mimic in a folder outside your EverQuest folder. Mimic’s files or antivirus on the game folder can block Zeal.',
      note: 'Logs are still found inside the EverQuest folder; only Zeal minds.',
    },
    {
      id: 'compat-mode',
      problem: 'Zeal never connects, and Mimic’s log keeps saying the Zeal pipe disconnected.',
      fix: 'Right-click eqgame.exe, Properties, Compatibility tab, and untick Run this program in compatibility mode for. Restart the game.',
      note: 'Windows XP compatibility mode, often advised against crashes, breaks the Zeal connection. Also check Run this program as an administrator is off.',
    },
    {
      id: 'no-logs',
      problem: 'Mimic sees no character.',
      fix: 'Type /log on in the game, then zone so the log gets a new line.',
    },
    {
      id: 'eq-time-zone',
      problem: 'EverQuest only starts after I change my Windows time zone.',
      fix: 'Close the game. In Mimic Settings, find “EverQuest won’t start unless you change your time zone?”, press Check my EQ files, then Fix them. Then set Windows back. Without Mimic, run the script below in PowerShell with your EverQuest folder on the first line.',
      note: 'A community fix: broken file creation dates trip the game. It changes only those dates, never file contents. The script needs English Windows; Mimic’s button works on any.',
      code: { label: 'PowerShell script (English Windows only)', text: EQ_DATES_SCRIPT },
    },
  ] as Fix[],
};

// ─── Footer pointers ────────────────────────────────────────────────────────────────────────────────
export const STILL_STUCK = {
  title: 'Still stuck?',
  body: 'Source and releases are on GitHub.',
};
