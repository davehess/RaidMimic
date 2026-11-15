// "My raids" on raidmimic.com (the guild lead, 2026-11-15: "the pages should be user focused and less on the guild leaders at
// the top. upcoming raids with targets needed, calendar view, set your own guilds raiding days, select your own characters
// guilds from drop-down"). A player keeps a short list of the guilds they raid with (hub_player_guilds), each with raid days
// and a time, either the guild's own schedule (guild_settings, for a registered guild) or one the player typed. This file is
// the whole of the arithmetic and the rules, and it is PURE: no database, no framework, no `@/` import, so the page, the
// server actions and the tests all run the same functions.
//
// The zone and daylight-saving arithmetic is guildSettings.ts windowsAround; nothing here re-derives it. The per-character
// "ready / needs / not sure" is flagEventNeeds.ts verdictForTarget over the real gate rule (popGateStatus.ts), the same
// answer the flag-event board gives, so the two cannot disagree.

import { mergeSettings, toMinutes, validTimeZone, windowsAround, formatInZone, type GuildSettings } from './guildSettings';
import { FLAG_TARGETS, flagTargetByKey, type FlagTarget } from './flagTargets';
import { verdictForTarget, type NeedVerdict } from './flagEventNeeds';
import { gateReport } from './popGateStatus';
import { POP_ZONE_BY_KEY } from './popFlags';

type Sched = GuildSettings['schedule'];
export type RaidWindowMs = { startMs: number; endMs: number; planEndMs: number };

/** A player may keep this many guild entries. */
export const MAX_GUILD_ENTRIES = 10;
export const LABEL_MIN = 2;
export const LABEL_MAX = 40;
/** Length of a raid when the player gave none. */
export const DEFAULT_DURATION_MIN = 180;
const DAY_MS = 86_400_000;

// ── What the player typed ────────────────────────────────────────────────────────────────────────────────────

// Control characters, the zero-width and bidi-control runs and the byte-order mark, built from code ranges so no invisible
// character sits in this source.
const NOISE = new RegExp('[' + ([[0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]] as const)
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']+', 'g');

/** A guild name typed by hand, as plain text: NFKC, control and zero-width characters gone, runs of space one space.
 *  null when it is not 2 to 40 characters after that. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFKC').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return s.length >= LABEL_MIN && s.length <= LABEL_MAX ? s : null;
}

export type EntryInput = {
  guildId?: unknown; label?: unknown; days?: unknown; start?: unknown; durationMin?: unknown; tz?: unknown; useGuildSchedule?: unknown;
};
export type CleanEntry = {
  guildId: string | null; label: string | null; days: number[]; start: string | null; durationMin: number | null; tz: string; useGuildSchedule: boolean;
};

/** Check what a form sent. A registered guild (`guildId`) wins over a typed name. Days are 0 (Sunday) to 6, the start is a
 *  24-hour time, the length 30 to 600 minutes, the zone one this site knows. */
export function validateEntry(input: EntryInput): { ok: true; value: CleanEntry } | { ok: false; error: string } {
  const guildId = typeof input.guildId === 'string' && input.guildId.trim() ? input.guildId.trim() : null;
  const label = guildId ? null : cleanLabel(input.label);
  if (!guildId && !label) return { ok: false, error: `Pick a guild, or type its name (${LABEL_MIN} to ${LABEL_MAX} letters).` };

  const rawDays = Array.isArray(input.days) ? input.days : [];
  const days: number[] = [];
  for (const d of rawDays) {
    const n = typeof d === 'string' && /^\d$/.test(d) ? Number(d) : d;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 6) return { ok: false, error: 'Raid days are Sunday to Saturday.' };
    if (!days.includes(n)) days.push(n);
  }
  days.sort((a, b) => a - b);

  let start: string | null = null;
  if (typeof input.start === 'string' && input.start.trim()) {
    if (toMinutes(input.start.trim()) === null) return { ok: false, error: 'Use a 24-hour start time like 20:30.' };
    start = input.start.trim();
  }

  let durationMin: number | null = null;
  if (input.durationMin !== undefined && input.durationMin !== null && input.durationMin !== '') {
    const n = typeof input.durationMin === 'string' ? Number(input.durationMin) : input.durationMin;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 30 || n > 600) return { ok: false, error: 'A raid lasts 30 to 600 minutes.' };
    durationMin = n;
  }

  const tz = input.tz === undefined || input.tz === '' ? 'America/New_York' : input.tz;
  if (!validTimeZone(tz)) return { ok: false, error: 'That is not a time zone this site knows. Pick one from the list.' };

  const useGuildSchedule = input.useGuildSchedule === undefined ? true : input.useGuildSchedule === true || input.useGuildSchedule === 'on' || input.useGuildSchedule === 'true';
  return { ok: true, value: { guildId, label, days, start, durationMin, tz, useGuildSchedule } };
}

// ── The schedule of one entry ────────────────────────────────────────────────────────────────────────────────

export type GuildEntry = {
  id: string;
  guildId: string | null;
  /** The name shown: the registered guild's display name, or the typed one. */
  guildName: string;
  days: number[];
  startHhmm: string | null;
  durationMin: number | null;
  tz: string;
  useGuildSchedule: boolean;
};

const hm = (minutes: number) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * The schedule an entry raids on. A registered guild's own schedule (its guild_settings row, `guildSettings`) when the entry
 * follows it and that guild has picked days; otherwise the player's own days, start and length. null when neither gives a
 * day, a start and a zone this site knows.
 */
export function scheduleFor(
  entry: Pick<GuildEntry, 'guildId' | 'days' | 'startHhmm' | 'durationMin' | 'tz' | 'useGuildSchedule'>,
  guildSettings: unknown,
): Sched | null {
  if (entry.guildId && entry.useGuildSchedule && guildSettings) {
    const s = mergeSettings(guildSettings).schedule;
    if (s.days.length && validTimeZone(s.tz)) return s;
  }
  const start = entry.startHhmm ? toMinutes(entry.startHhmm) : null;
  if (!entry.days.length || start === null || !validTimeZone(entry.tz)) return null;
  if (!entry.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const end = hm(start + (entry.durationMin ?? DEFAULT_DURATION_MIN));
  return { tz: entry.tz, days: [...entry.days].sort((a, b) => a - b), start: entry.startHhmm as string, end, planEnd: end, nightCutoffHour: 6 };
}

/** The raids on now or starting within the next `days` days, earliest first. A raid that ran past midnight from yesterday counts
 *  while it is still on. [] for a schedule with no day or an unknown zone. */
export function upcomingRaids(schedule: Sched, nowMs: number, days = 14): RaidWindowMs[] {
  return windowsAround(schedule, nowMs, days).filter(w => w.endMs > nowMs && w.startMs < nowMs + days * DAY_MS);
}

/** The calendar day an instant falls on in a zone, as YYYY-MM-DD. */
export function dateKeyIn(ms: number, tz: string): string {
  const o: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))) o[p.type] = p.value;
  return `${o.year}-${o.month}-${o.day}`;
}

function dateLabelIn(ms: number, tz: string): string {
  try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 10); }
}

// ── The list ─────────────────────────────────────────────────────────────────────────────────────────────────

export type MyCharacter = { name: string; flags: string[]; playerGuildId: string | null };
export type PublishedTarget = { guildId: string; startsMs: number; targetKey: string };

export type MyRaid = {
  entryId: string;
  guildName: string;
  tz: string;
  startMs: number;
  endMs: number;
  /** The raid's day in the entry's zone, YYYY-MM-DD: what a target set by the player is keyed on. */
  dateKey: string;
  localDateLabel: string;
  /** "Wed, 8:30 PM EST" */
  timeLabel: string;
  targetKey: string | null;
  /** 'guild': an officer of the registered guild posted it. 'mine': the player set it. */
  targetSource: 'guild' | 'mine' | null;
  perCharacter: { name: string; verdict: NeedVerdict; needs: string[] }[];
};

export type BuildInput = {
  entries: readonly GuildEntry[];
  /** guild_settings.settings by hub guild id, for the entries that follow a registered guild's schedule. */
  guildSchedules: Readonly<Record<string, unknown>>;
  /** The target a player set, keyed `${entryId}|${YYYY-MM-DD}`. */
  targetsByEntryDate: Readonly<Record<string, string>>;
  /** Targets a registered guild posted (flag_events). */
  publishedTargets: readonly PublishedTarget[];
  characters: readonly MyCharacter[];
  /** How far ahead to look; the list is 14, the calendar asks for the month. */
  days?: number;
};

export const targetKeyOf = (entryId: string, dateKey: string) => `${entryId}|${dateKey}`;

function verdictsFor(target: FlagTarget, chars: readonly MyCharacter[]): MyRaid['perCharacter'] {
  const zone = POP_ZONE_BY_KEY[target.gate];
  return chars.map(c => {
    const input = { flags: c.flags, fullRead: true };
    const verdict = verdictForTarget(target, input);
    let needs: string[] = [];
    if (verdict !== 'done' && zone) {
      const want = verdict === 'need' ? 'missing' : 'unknown';
      needs = gateReport(zone, input).pieces.filter(p => target.pieces.includes(p.key) && p.state === want).map(p => p.label);
    }
    return { name: c.name, verdict, needs };
  });
}

/**
 * Every raid in the window, for every entry, earliest first, each with its target and, for each of the player's characters,
 * ready / needs / not sure. Characters linked to an entry are the ones asked about; an entry with none linked asks about the
 * characters not linked to any guild (so a player with one guild and no links sees them all).
 */
export function buildMyRaids(input: BuildInput, nowMs: number): MyRaid[] {
  const days = input.days ?? 14;
  const out: MyRaid[] = [];
  for (const e of input.entries.slice(0, MAX_GUILD_ENTRIES)) {
    const sched = scheduleFor(e, e.guildId ? input.guildSchedules[e.guildId] ?? null : null);
    if (!sched) continue;
    const linked = input.characters.filter(c => c.playerGuildId === e.id);
    const chars = linked.length ? linked : input.characters.filter(c => !c.playerGuildId);
    for (const w of upcomingRaids(sched, nowMs, days)) {
      const dateKey = dateKeyIn(w.startMs, sched.tz);
      const published = e.guildId
        ? input.publishedTargets.find(p => p.guildId === e.guildId && flagTargetByKey(p.targetKey) && dateKeyIn(p.startsMs, sched.tz) === dateKey)
        : undefined;
      const mineKey = input.targetsByEntryDate[targetKeyOf(e.id, dateKey)];
      const targetKey = published ? published.targetKey : mineKey && flagTargetByKey(mineKey) ? mineKey : null;
      const target = targetKey ? flagTargetByKey(targetKey) ?? null : null;
      out.push({
        entryId: e.id, guildName: e.guildName, tz: sched.tz, startMs: w.startMs, endMs: w.endMs, dateKey,
        localDateLabel: dateLabelIn(w.startMs, sched.tz), timeLabel: formatInZone(w.startMs, sched.tz),
        targetKey: target ? target.key : null,
        targetSource: target ? (published ? 'guild' : 'mine') : null,
        perCharacter: target ? verdictsFor(target, chars) : [],
      });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.guildName.localeCompare(b.guildName));
}

/** A target's words for a raid row: its label, or nothing. */
export function targetLabel(key: string | null): string | null {
  return key ? flagTargetByKey(key)?.label ?? null : null;
}

/** The pick list for "set your target": every catalog target. */
export const TARGET_CHOICES = FLAG_TARGETS.map(t => ({ key: t.key, label: t.label }));

// ── The calendar ─────────────────────────────────────────────────────────────────────────────────────────────

export type CalendarCell = { day: number; dateKey: string; raids: MyRaid[] } | null;

/** `?m=YYYY-MM` from the URL, or null for anything else (the page then shows the month of `now`). */
export function parseMonth(raw: unknown): { y: number; m: number } | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 2000 && y <= 2100 ? { y, m: Number(m[2]) } : null;
}

export const monthParam = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

/** Move a month by `by` months (negative for back); the year rolls over. */
export function shiftMonth(y: number, m: number, by: number): { y: number; m: number } {
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

/** A month as weeks of seven cells, Sunday first; a null cell is padding outside the month. Each real cell carries the raids
 *  whose day (in their own zone) is that date. */
export function monthCells(y: number, m: number, raids: readonly MyRaid[]): CalendarCell[][] {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: CalendarCell[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= last; d++) {
    const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateKey, raids: raids.filter(r => r.dateKey === dateKey) });
  }
  while (cells.length % 7) cells.push(null);
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
