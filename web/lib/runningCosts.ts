// The figures on https://raidmimic.com/costs ("What Raid Mimic costs to run"), in ONE place so they are updated in one
// place (the guild lead, 2026-11-15, DECISIONS §588: live party merging is free and donation-funded, hosted replays are
// what we charge for, "the rest we can eat up front and show the cost of it on the site").
//
// Every figure carries a `source` note saying where it came from. A figure nobody has measured is `null` and the page
// says "not yet measured"; never put a guess in here. Refresh these the way docs/COSTS.md §5 says, then move `measuredAt`.

export const measuredAt = '2026-11-15';

// Donations go to Ko-fi. Exactly this address (test/running-costs.test.js pins it).
export const KOFI_URL = 'https://ko-fi.com/davehess';

// What a donation is and is not: one honest line from docs/COSTS.md §6.
export const donationLine = {
  text: 'A donation buys nothing: no priority, no feature, no support tier and no say in the roadmap, and nothing is held back from anyone who gives nothing. It only offsets the bills below.',
  source: 'docs/COSTS.md §6 (what a donation is, and is not)',
};

export type BillLine = {
  key: string;
  name: string;
  what: string;
  /** Dollars a month, or null while it is not measured. */
  monthly: number | null;
  /** What the page prints in the table. */
  display: string;
  source: string;
};

export const bill: BillLine[] = [
  {
    key: 'supabase',
    name: 'Supabase',
    what: 'The database: accounts, characters, recaps and the replay feed.',
    monthly: 30,
    display: '$30 ($25 plan + about $5 for the larger database size)',
    source: 'docs/COSTS.md §2 and §8a (Pro, $25) and §8c (Small compute, about +$5 a month after the included $10 credit, 2026-11-04)',
  },
  {
    key: 'railway',
    name: 'Railway',
    what: 'The Wolf Pack bot, and the Raid Mimic party service that merges live overlays.',
    monthly: 5,
    display: '$5 plan; the party service’s own usage is not yet measured',
    source: 'docs/COSTS.md §2 (Hobby plan, $5; the bot uses about $1.20 of it). The party service runs in its own Railway project and has no measurement yet',
  },
  {
    key: 'vercel',
    name: 'Vercel',
    what: 'The website you are reading.',
    monthly: 20,
    display: '$20 (Pro plan)',
    source: 'The guild lead, 2026-11-15: "vercel isn\'t free" (Pro, $20 a month per docs/COSTS.md §8a; COSTS.md §2 still said Hobby $0)',
  },
  {
    key: 'domains',
    name: 'Domains',
    what: 'raidmimic.com and its sister addresses.',
    monthly: 3,
    display: 'about $3 (roughly $35 a year together)',
    source: 'docs/COSTS.md §8a (about $35 a year together)',
  },
];

/** The part of the bill that has a number. The party service is the known gap, so the page says "at least". */
export const knownMonthly: number = bill.reduce((sum, l) => sum + (l.monthly ?? 0), 0);

export type Size = {
  key: string;
  label: string;
  /** Megabytes for one guild for one week, or null while it is not measured. */
  mb: number | null;
  source: string;
};

// Recaps: the free summary of a raid night. ~40 MB per guild-week, measured 2026-11-15.
export const recapSize: Size = {
  key: 'recaps',
  label: 'Recaps (positions per minute, drops, rolls, attendance, per-ability totals)',
  mb: 40,
  source: 'DECISIONS §588, measured 2026-11-15',
};

// Replays: the per-second fight feed. ~470 MB per guild-week, measured 2026-11-15, of which:
export const replaySize: Size = {
  key: 'replays',
  label: 'Replays (the per-second fight feed)',
  mb: 470,
  source: 'DECISIONS §588, measured 2026-11-15',
};

export const replayParts: Size[] = [
  { key: 'threat-snapshots', label: 'Threat snapshots', mb: 307, source: 'Measured 2026-11-15 on the live database' },
  { key: 'buff-landings', label: 'Buff landings', mb: 75, source: 'Measured 2026-11-15 on the live database' },
  { key: 'threat-graphs', label: 'Threat graphs and events', mb: 85, source: 'Measured 2026-11-15 on the live database (about 85 MB, rounded)' },
];

// The storage rate behind "how much is a megabyte": Supabase Pro bills database size above its included 8 GB.
export const storageRate = { perGbMonth: 0.125, includedGb: 8, source: 'docs/COSTS.md §3 and §8 (Supabase Pro, $0.125 per GB-month above 8 GB)' };

// Everything with a figure, for the test that every figure names its source.
export const allFigures: { key: string; source: string }[] = [
  ...bill, recapSize, replaySize, ...replayParts,
  { key: 'storage-rate', source: storageRate.source },
  { key: 'donation', source: donationLine.source },
];
