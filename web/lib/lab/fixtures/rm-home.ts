// The words of the raidmimic.com player-first landing drafts (design lab, rm-home; the guild lead, 2026-11-15: "the pages
// should be user focused and less on the guild leaders at the top"). Plain data, no JSX. Every sentence says what exists
// today; what is still being built carries `soon`, which the page draws as a "coming" chip (CLAUDE.md honesty rule).
// Nothing here names a member, a character or an address.

export type HomeVariant = 'a' | 'b' | 'c';
export const HOME_VARIANTS: readonly HomeVariant[] = ['a', 'b', 'c'];
export const isHomeVariant = (v: string | null | undefined): v is HomeVariant => v === 'a' || v === 'b' || v === 'c';

export const DRAFT_LINES: Record<HomeVariant, { name: string; diff: string; rec?: boolean }> = {
  a: { name: 'Player home', diff: 'the page is the player’s: nav is Home, My raids, My characters, Guilds; guild blocks sit under “Running a guild?”', rec: true },
  b: { name: 'Two doors', diff: 'the top splits into “I raid” and “I lead a guild”; the nav shrinks to the logo and Sign in' },
  c: { name: 'Tool first', diff: 'the PoP flag paste box is the first thing on the page; the result shows after sign-in' },
};

/** The player's nav (variant A and C). `soon` marks a page that is still being built on another branch. */
export const PLAYER_NAV = [
  { label: 'Home', href: '/' },
  { label: 'My raids', href: '/raids' },
  { label: 'My characters', href: '/characters' },
  { label: 'Guilds', href: '/guilds?stay=1' },
] as const;
export const LEADER_NAV = { label: 'For guild leaders', href: '/register' } as const;

export const PLAYER_HERO = {
  kicker: 'Raid Mimic · free for every player',
  headline: 'Track your PoP flags and raids. Free.',
  sentence: 'Load your flags from the file Zeal already writes, see what you need next, and keep the raids you are in in one place. Raid Mimic’s overlays read the log EverQuest already writes.',
  signIn: 'Sign in with Discord',
  download: 'Download Mimic',
  demo: 'See the demo',
  fine: 'No card needed. The overlays run on your own PC.',
};

/** What a player gets: one line each. */
export const PLAYER_GETS: readonly { id: string; name: string; line: string; href: string; soon?: string }[] = [
  { id: 'flags', name: 'My characters', line: 'Load each character’s PoPFlags file and see which flags you have and which you need next.', href: '/characters' },
  { id: 'raids', name: 'My raids', line: 'Upcoming raids with their targets, a calendar and who is coming today, across your guilds.', href: '/raids', soon: 'My raids is coming' },
  { id: 'mimic', name: 'Mimic overlays', line: 'Damage, what is on the boss and spawn timers, drawn over the game from the log. Free and open source.', href: '/setup' },
];

export const LEADER_DIVIDER = { title: 'Running a guild?', line: 'Shared raid reviews, merged parses and a command center, from the same log. These are for the people who run the raid.' };

export const DOORS = {
  headline: 'Raid Mimic',
  sentence: 'Free, open-source overlays for your EverQuest raids. Pick the door that fits you.',
  raid: {
    id: 'raid', title: 'I raid', tag: 'free for players',
    lines: ['Your PoP flags, loaded from Zeal’s file', 'Upcoming raids and their targets', 'Overlays: damage, debuffs, timers'],
    primary: 'Sign in with Discord', secondary: 'Download Mimic',
  },
  lead: {
    id: 'lead', title: 'I lead a guild', tag: 'for the people who run the raid',
    lines: ['Shared raid reviews and merged parses', 'A command center for your officers', 'Pro · Guild, $25 a month'],
    primary: 'Register interest', secondary: 'See the guild demo',
  },
  more: { raid: 'What you get as a player', lead: 'What a guild gets' },
};

export const TOOL = {
  kicker: 'Raid Mimic · free for every player',
  headline: 'Paste your PoP flags. See what you need next.',
  sentence: 'Open a Name-PoPFlags.txt file (Zeal writes one when you camp with “Export data on /camp” on) and paste it here. Sign in with Discord and your flags are waiting on My characters.',
  label: 'Your PoPFlags file, pasted',
  placeholder: 'Paste the contents of Name-PoPFlags.txt here',
  count: (n: number) => (n === 0 ? 'Nothing pasted yet.' : `${n} line${n === 1 ? '' : 's'} ready. They stay in this browser tab until you sign in.`),
  signIn: 'Sign in to see my flags',
  alt: 'Or download Mimic first',
};
