// "Free to start": what the raidmimic.com onboarding pages say about money before anyone sets anything up (the guild
// lead, 2026-11-02: "keep working on the onboarding flow for raidmimic.com. talk about planned pricing to start ... so it
// stays free to start"). Shown on /raidmimic/setup and /guilds/new as a preview on beta (?v=b short, ?v=c cost table);
// with no ?v= the pages stay as production shows them. Every price comes from raidmimicStory.ts. A plan is sold for what a
// guild learns from its raids; storage is included while you pay and is never the reason given (DECISIONS §552).
import { EARLY_GUILD_PRICE, priceLabel } from './raidmimicStory';

export type StartFreeVariant = 'b' | 'c';
export function startFreeVariant(v: string | undefined): StartFreeVariant | null {
  return v === 'b' || v === 'c' ? v : null;
}

export const START_FREE = {
  chip: 'Free to start',
  lead: 'Setting up Mimic or starting a guild costs nothing, and nothing asks for a card.',
  free: 'Free stays free: the overlays, triggers, the meter on your own PC, your PoP flags and boss kills synced, and tonight\'s merged parse and target info, gone by morning.',
  planned: `Planned: Pro · Guild from ${priceLabel(EARLY_GUILD_PRICE)} (early bird): every raid kept, raid reviews, replays and a bot in your Discord.`,
  promise: 'Nothing is charged until you choose a plan.',
  more: 'See pricing',
  tableTitle: 'What Free gives, and what Pro gives',
  tableLead: 'Free covers tonight\'s raid. Pro keeps it and reads it back to you.',
} as const;

export interface CostRow { what: string; gives: string }
export const FREE_ROWS: readonly CostRow[] = [
  { what: 'Overlays, triggers, the meter on your PC', gives: 'Runs on your own PC, no account needed.' },
  { what: 'PoP flags and boss kills, synced', gives: 'Your flags and kills follow you.' },
  { what: 'Your guild’s feed of its flags and kills', gives: 'Your site or bot hears every flag and kill.' },
  { what: 'Tonight’s merged parse and shared target info', gives: 'The whole raid on one meter during the night. Gone by the next morning.' },
];
export const PAID_ROWS: readonly CostRow[] = [
  { what: 'Replays, spectator, raid reviews', gives: 'See every fight again, positions and all.' },
  { what: 'Merged parses, kept', gives: 'Every fight stays: one parse for the whole raid, every raider counted.' },
  { what: 'Chat relay and /who history', gives: 'Look back at what was said and who was there.' },
  { what: 'A Raid Mimic bot in your Discord', gives: 'Boss timers and kill cards in your own server.' },
];
