// The /design style guide's live samples, from the real boss timers (bot_boards, the table /boards reads). The guild
// lead, 2026-11-16, on the first draft's made-up rows: "These examples are crappy. Nagafen isn't killable every day,
// let alone three days in a row. Use real timers." Pure, so test/design-system.test.js runs it on fixed rows.

export type TimerRow = {
  boss_id: string; name: string | null; zone: string | null;
  timer_hours: number | null; killed_at: string | null; next_spawn: string | null;
};

export type TimerSample = {
  id: string; name: string; zone: string;
  /** Minutes of the respawn timer that have run (0 with no kill on record), and the timer's length in minutes. */
  done: number; total: number;
  state: 'up' | 'soon' | 'cooldown';
  /** "available now", "in 3h 12m", "in 2d 6h". */
  when: string;
  respawn: string;
  killedAt: string | null;
  nextSpawn: string | null;
};

/** A duration in plain words; over 48 hours in days (the design review, 2026-11-16: "214 h 1 min ago" should read "8d 22h"). */
export function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function timerSample(r: TimerRow, now: number): TimerSample | null {
  const hours = Number(r.timer_hours);
  if (!r.name || !Number.isFinite(hours) || hours <= 0) return null;
  const total = Math.round(hours * 60);
  // Respawn timers are known by their hours in game talk ("66 hours", "162"), so they stay in hours.
  const respawn = `${Math.round(hours)}h`;
  const base = { id: r.boss_id, name: r.name, zone: r.zone ?? '', total, respawn, killedAt: r.killed_at, nextSpawn: r.next_spawn };
  const killed = r.killed_at ? Date.parse(r.killed_at) : NaN;
  const next = r.next_spawn ? Date.parse(r.next_spawn) : (Number.isFinite(killed) ? killed + hours * 3_600_000 : NaN);
  // No kill time is how bot_boards says "available now" (the bot clears it when the timer runs out), as /boards reads it.
  if (!Number.isFinite(killed) || !Number.isFinite(next) || next <= now) {
    return { ...base, done: total, state: 'up', when: 'available now' };
  }
  const done = Math.min(total, Math.max(0, Math.round((now - killed) / 60_000)));
  return { ...base, done, state: next - now <= 24 * 3_600_000 ? 'soon' : 'cooldown', when: `in ${span(next - now)}` };
}

/** What the samples show: every running timer, soonest first, then bosses that are available in the same zones (the
 *  raid's own picture: what is down and what is still up where it raids), then any other available boss. At most `n`. */
export function pickSamples(rows: TimerRow[], now: number, n = 6): TimerSample[] {
  const all = rows.map(r => timerSample(r, now)).filter((s): s is TimerSample => s !== null);
  const waiting = all.filter(s => s.state !== 'up')
    .sort((a, b) => Date.parse(a.nextSpawn ?? '') - Date.parse(b.nextSpawn ?? ''));
  const zones = new Set(waiting.map(s => s.zone));
  const up = all.filter(s => s.state === 'up');
  const upNear = up.filter(s => zones.has(s.zone)).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const upElse = up.filter(s => !zones.has(s.zone)).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const keep = Math.min(waiting.length, Math.max(1, n - 2));   // leave room for at least two "available" rows
  return [...waiting.slice(0, keep), ...upNear, ...upElse, ...waiting.slice(keep)].slice(0, n);
}
