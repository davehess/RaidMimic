// "Free to start": what the raidmimic.com onboarding pages say about money before anyone sets anything up (the guild
// lead, 2026-11-02: "keep working on the onboarding flow for raidmimic.com. talk about planned pricing to start ... so it
// stays free to start"). Shown on /raidmimic/setup and /guilds/new as a preview on beta (?v=b short, ?v=c cost table);
// with no ?v= the pages stay as production shows them. Every price comes from raidmimicStory.ts. A plan is sold for what a
// guild learns from its raids; storage is included while you pay and is never the reason given (DECISIONS §552).
import { EARLY_GUILD_PRICE, GUILD_HISTORY_DAYS, priceLabel } from './raidmimicStory';

export type StartFreeVariant = 'b' | 'c';
export function startFreeVariant(v: string | undefined): StartFreeVariant | null {
  return v === 'b' || v === 'c' ? v : null;
}

export const START_FREE = {
  chip: 'Free to start',
  lead: 'Setting up Mimic or starting a guild costs nothing, and nothing asks for a card.',
  free: 'Free stays free: the overlays, triggers, the meter on your own PC, your flags and kills synced, all of tonight\'s raid (merged parses, review, replay), and each night\'s parse totals.',
  planned: `Planned: Pro · Guild from ${priceLabel(EARLY_GUILD_PRICE)} (early bird) keeps the last ${GUILD_HISTORY_DAYS} days of raids; the larger size keeps them second by second, with replays.`,
  promise: 'Nothing is charged until you choose a plan.',
  more: 'See pricing',
  tableTitle: 'What Free gives, and what Pro gives',
  tableLead: 'Free gives you all of tonight\'s raid. Pro keeps it.',
} as const;

export interface CostRow { what: string; gives: string }
export const FREE_ROWS: readonly CostRow[] = [
  { what: 'Overlays, triggers, the meter on your PC', gives: 'Runs on your own PC, no account needed.' },
  { what: 'PoP flags and boss kills, synced', gives: 'Your flags and kills follow you.' },
  { what: 'Your guild’s feed of its flags and kills', gives: 'Your site or bot hears every flag and kill.' },
  { what: 'Tonight’s raid, all of it', gives: 'Merged parses, raid review, replay and spectator, Command Center and the Discord bot. The detail goes the next morning.' },
  { what: 'Each night’s parse totals', gives: 'Who did what, fight by fight, kept.' },
];
export const PAID_ROWS: readonly CostRow[] = [
  { what: `The last ${GUILD_HISTORY_DAYS} days of raids`, gives: 'Raid reviews, merged parses, chat and /who history.' },
  { what: 'Second by second, with replays (the larger size)', gives: `Every fight to the second and its replay, for the same ${GUILD_HISTORY_DAYS} days.` },
];
