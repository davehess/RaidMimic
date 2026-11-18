// /raids: "My raids" on raidmimic.com (the guild lead, 2026-11-15: "the pages should be user focused and less on the guild
// leaders at the top. upcoming raids with targets needed, calendar view, set your own guilds raiding days, select your own
// characters guilds from drop-down"). A player's own list of guilds with their raid days; the next two weeks of raids with a
// target and what each of their characters still needs for it; the same raids as a month calendar (?view=calendar).
//
// New page, so it goes live with the [beta] tag. Signed-in players only; ONLY the signed-in player's own entries and
// characters are read (web/lib/myRaidsLoad.ts, keyed on the session's Discord id). Everything player-supplied (a typed
// guild name, a character name) renders as plain text. Server-rendered, no client script: the forms post to actions.ts.
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { discordIdOf } from '@/lib/lockout';
import { isRaidmimicHost } from '@/lib/raidmimicHost';
import SignInButton from '@/components/SignInButton';
import HostFrame from '@/components/RaidmimicFrame';
import { COMMON_ZONES, DAY_NAMES, relativeTime } from '@/lib/guildSettings';
import { buildMyRaids, monthCells, monthParam, parseMonth, shiftMonth, targetLabel, TARGET_CHOICES, MAX_GUILD_ENTRIES, LABEL_MAX, type MyRaid } from '@/lib/myRaids';
import { loadMyRaids } from '@/lib/myRaidsLoad';
import { saveGuild, removeGuild, setRaidTarget } from './actions';
import CharacterGuilds from './CharacterGuilds';
import { EVENTS, GUILD, DEMO_BAR, targetByKey } from '@/lib/demoGuild';
import { demoBase } from '../raidmimic/demo/_parts/DemoShell';

const TITLE = 'My raids';
const DESCRIPTION = 'Your upcoming raids on Raid Mimic: the days each of your guilds raids, the target for each night, and which of your characters is ready or still needs a flag for it.';

export function generateMetadata(): Metadata {
  const onHost = isRaidmimicHost(headers().get('host'));
  return {
    title: onHost ? { absolute: `${TITLE} · Raid Mimic` } : TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

const CARD = 'rounded-lg border border-border bg-panel p-4';
const FIELD = 'min-h-11 rounded border border-border bg-bg px-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-blue';
const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 text-sm text-gold hover:no-underline focus-visible:ring-2 focus-visible:ring-blue';
const VERDICT_TONE = { done: 'text-green', need: 'text-orange', unsure: 'text-dim' } as const;

function verdictText(v: MyRaid['perCharacter'][number]): string {
  if (v.verdict === 'done') return 'ready';
  if (v.verdict === 'need') return `needs ${v.needs.join(', ') || 'a piece'}`;
  return 'not sure';
}

function TargetPicker({ raid }: { raid: MyRaid }) {
  if (raid.targetSource === 'guild') {
    return <p className="m-0 text-sm"><span className="text-text">{targetLabel(raid.targetKey)}</span> <span className="text-xs text-dim">set by your guild</span></p>;
  }
  return (
    <form action={setRaidTarget} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={raid.entryId} />
      <input type="hidden" name="date" value={raid.dateKey} />
      <label className="sr-only" htmlFor={`t-${raid.entryId}-${raid.dateKey}`}>Target for {raid.localDateLabel}</label>
      <select id={`t-${raid.entryId}-${raid.dateKey}`} name="target" defaultValue={raid.targetKey ?? ''} className={FIELD}>
        <option value="">No target yet</option>
        {TARGET_CHOICES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <button type="submit" className={BTN}>Set</button>
    </form>
  );
}

function RaidRow({ raid, nowMs }: { raid: MyRaid; nowMs: number }) {
  return (
    <li className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="m-0 text-base text-text">{raid.localDateLabel} <span className="text-dim">· {raid.timeLabel.replace(/^\w+, /, '')}</span></h3>
        <span className="text-xs text-dim">{raid.startMs <= nowMs ? 'on now' : relativeTime(raid.startMs, nowMs)}</span>
      </div>
      <p className="m-0 mt-1 text-sm text-dim">{raid.guildName}</p>
      <div className="mt-3"><TargetPicker raid={raid} /></div>
      {raid.perCharacter.length > 0 && (
        <ul className="m-0 mt-3 list-none space-y-1 p-0 text-sm">
          {raid.perCharacter.map(c => (
            <li key={c.name}><span className="text-text">{c.name}</span> <span className={VERDICT_TONE[c.verdict]}>{verdictText(c)}</span></li>
          ))}
        </ul>
      )}
      {!raid.targetKey && <p className="m-0 mt-3 text-xs text-dim">Pick a target.</p>}
    </li>
  );
}

// The demo, kept apart from the player's own data (the guild lead, 2026-11-17: "it should show demo data until you sign in, then
// it should show your own information and a separate demo section"). Signed out it is all there is; signed in it is a labelled
// block at the foot of the page. Invented guild, static, nothing read or saved.
function DemoSection() {
  const base = demoBase();
  return (
    <section aria-label="Demo" className="mt-10 rounded-lg border border-dashed border-border bg-panel p-4">
      <h2 className="m-0 text-lg text-text">Demo <span className="ml-1 rounded border border-border px-2 align-middle text-xs text-dim">sample guild</span></h2>
      <p className="mt-1 text-sm text-dim">{DEMO_BAR}. {GUILD.name} raids {GUILD.nights}.</p>
      <ul className="m-0 mt-3 list-none space-y-1 p-0 text-sm">
        {EVENTS.map(e => (
          <li key={e.id} className="text-text">{e.day} {e.time} <span className="text-dim">· {targetByKey(e.target)?.label ?? e.target}</span></li>
        ))}
      </ul>
      <p className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={`${base}/raid`} className="inline-flex min-h-11 items-center">Next raid, demo</a>
        <a href={`${base}/events`} className="inline-flex min-h-11 items-center">Events, demo</a>
      </p>
    </section>
  );
}

function Calendar({ raids, y, m }: { raids: MyRaid[]; y: number; m: number }) {
  const weeks = monthCells(y, m, raids);
  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const title = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return (
    <div>
      <div className="flex items-center justify-between">
        <a href={`/raids?view=calendar&m=${monthParam(prev.y, prev.m)}`} className="inline-flex min-h-11 items-center text-sm">&larr; Earlier</a>
        <h3 className="m-0 text-base text-text">{title}</h3>
        <a href={`/raids?view=calendar&m=${monthParam(next.y, next.m)}`} className="inline-flex min-h-11 items-center text-sm">Later &rarr;</a>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-px rounded border border-border bg-border text-xs">
        {DAY_NAMES.map(d => <div key={d} className="bg-panel px-1 py-1 text-center text-dim">{d.slice(0, 3)}</div>)}
        {weeks.flat().map((c, i) => (
          <div key={i} className={`min-h-16 bg-panel p-1 ${c && c.raids.length ? 'ring-1 ring-inset ring-gold/60' : ''}`}>
            {c && <span className="text-dim">{c.day}</span>}
            {c?.raids.map(r => (
              <p key={r.entryId} className="m-0 mt-1 break-words leading-tight text-text">
                <span className="text-gold">{r.guildName}</span>{r.targetKey ? <> · {targetLabel(r.targetKey)}</> : null}
              </p>
            ))}
          </div>
        ))}
      </div>
      <p className="mb-0 mt-2 text-xs text-dim">Gold edge: a raid day. Each guild’s own time zone.</p>
    </div>
  );
}

function GuildForm({ entry, registered }: {
  entry: Awaited<ReturnType<typeof loadMyRaids>>['entries'][number] | null;
  registered: Awaited<ReturnType<typeof loadMyRaids>>['registered'];
}) {
  const zones = entry && !COMMON_ZONES.includes(entry.tz) ? [entry.tz, ...COMMON_ZONES] : COMMON_ZONES;
  const idPart = entry?.id ?? 'new';
  return (
    <form action={saveGuild} className="space-y-3">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-dim">Guild
          <select name="guild" defaultValue={entry ? (entry.guildId ?? 'other') : ''} className={`${FIELD} mt-1 block`} required>
            {!entry && <option value="" disabled>Pick a guild</option>}
            {registered.map(g => <option key={g.guildId} value={g.guildId}>{g.name}</option>)}
            <option value="other">Other (type its name)</option>
          </select>
        </label>
        <label className="text-sm text-dim">Its name, if other
          <input name="label" maxLength={LABEL_MAX} defaultValue={entry && !entry.guildId ? entry.guildName : ''} className={`${FIELD} mt-1 block`} />
        </label>
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="text-sm text-dim">Raid days</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {DAY_NAMES.map((d, i) => (
            <label key={d} className="inline-flex min-h-11 items-center gap-1 text-sm text-text">
              <input type="checkbox" name="days" value={i} defaultChecked={entry?.days.includes(i) ?? false} /> {d.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-dim">Starts
          <input type="time" name="start" defaultValue={entry?.startHhmm ?? '20:30'} className={`${FIELD} mt-1 block`} />
        </label>
        <label className="text-sm text-dim">Length (minutes)
          <input type="number" name="duration" min={30} max={600} step={15} defaultValue={entry?.durationMin ?? 180} className={`${FIELD} mt-1 block w-28`} />
        </label>
        <label className="text-sm text-dim">Time zone
          <select name="tz" defaultValue={entry?.tz ?? 'America/New_York'} className={`${FIELD} mt-1 block`}>
            {zones.map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-text" htmlFor={`ug-${idPart}`}>
        <input id={`ug-${idPart}`} type="checkbox" name="useGuild" defaultChecked={entry?.useGuildSchedule ?? true} />
        Use the guild’s schedule when it has one (registered guilds only)
      </label>
      <button type="submit" className={BTN}>{entry ? 'Save changes' : 'Add this guild'}</button>
    </form>
  );
}

export default async function RaidsPage({ searchParams }: { searchParams?: { view?: string; m?: string; err?: string } }) {
  const onHost = isRaidmimicHost(headers().get('host'));
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);
  const note = <p className="mb-3 inline-block rounded border border-gold/50 px-2 py-0.5 text-xs text-gold">[beta]</p>;

  if (!user || !discordId) {
    return (
      <HostFrame onHost={onHost}>
        <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
          {note}
          <h1 className="text-2xl text-gold">{TITLE}</h1>
          <p className="mt-2 text-sm text-dim">Sign in with Discord to see your upcoming raids.</p>
          <div className="mt-4"><SignInButton next="/raids" /></div>
          <DemoSection />
        </div>
      </HostFrame>
    );
  }

  const data = await loadMyRaids(discordId);
  const nowMs = Date.now();
  const calendar = searchParams?.view === 'calendar';
  const month = parseMonth(searchParams?.m) ?? (() => { const d = new Date(nowMs); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; })();
  // The list is two weeks; the calendar needs the rest of the month it is showing (and a month back from today is over already).
  const horizon = calendar ? Math.min(120, Math.max(14, Math.ceil((Date.UTC(month.y, month.m, 1) - nowMs) / 86_400_000) + 1)) : 14;
  const raids = buildMyRaids({ ...data, publishedTargets: data.published, days: horizon }, nowMs);
  const err = typeof searchParams?.err === 'string' ? searchParams.err.slice(0, 160) : null;
  const hasSchedule = data.guildHasSchedule;

  return (
    <HostFrame onHost={onHost}>
      <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
        {note}
        <h1 className="text-2xl text-gold">{TITLE}</h1>
        <p className="mt-1 text-sm text-dim">Only you can see this page.</p>
        {err && <p role="alert" className="mt-3 text-sm text-red">{err}</p>}

        <section aria-label="Upcoming raids" className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg text-text">Upcoming raids</h2>
            <nav aria-label="View" className="flex gap-1 text-sm">
              <a href="/raids" aria-current={calendar ? undefined : 'page'} className={`inline-flex min-h-11 items-center rounded px-3 ${calendar ? 'text-dim' : 'bg-panel text-gold'} hover:no-underline`}>List</a>
              <a href="/raids?view=calendar" aria-current={calendar ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded px-3 ${calendar ? 'bg-panel text-gold' : 'text-dim'} hover:no-underline`}>Calendar</a>
            </nav>
          </div>
          {data.entries.length === 0 && <p className="mt-3 text-sm text-dim">Add a guild below.</p>}
          {data.entries.length > 0 && raids.length === 0 && <p className="mt-3 text-sm text-dim">No raids in the next {horizon} days.</p>}
          {calendar
            ? <div className="mt-3"><Calendar raids={raids} y={month.y} m={month.m} /></div>
            : <ul className="m-0 mt-3 list-none space-y-3 p-0">{raids.map(r => <RaidRow key={`${r.entryId}-${r.dateKey}`} raid={r} nowMs={nowMs} />)}</ul>}
        </section>

        <section aria-label="My guilds" className="mt-8">
          <h2 className="m-0 text-lg text-text">My guilds</h2>
          <p className="mt-1 text-sm text-dim">Up to {MAX_GUILD_ENTRIES}.</p>
          <div className="mt-3 space-y-3">
            {data.entries.map(e => (
              <details key={e.id} className={CARD}>
                <summary className="cursor-pointer text-text">{e.guildName} <span className="text-xs text-dim">· {e.guildId && e.useGuildSchedule && hasSchedule[e.guildId] ? 'guild’s schedule' : e.days.map(d => DAY_NAMES[d]?.slice(0, 3)).join(' ') || 'no days yet'}</span></summary>
                <div className="mt-3">
                  <GuildForm entry={e} registered={data.registered} />
                  <form action={removeGuild} className="mt-3"><input type="hidden" name="id" value={e.id} /><button type="submit" className="text-xs text-dim underline hover:text-red focus-visible:ring-2 focus-visible:ring-blue">Remove this guild</button></form>
                </div>
              </details>
            ))}
            {data.entries.length < MAX_GUILD_ENTRIES && (
              <details open={data.entries.length === 0} className={CARD}>
                <summary className="cursor-pointer text-text">Add a guild</summary>
                <div className="mt-3"><GuildForm entry={null} registered={data.registered} /></div>
              </details>
            )}
          </div>
        </section>

        <section aria-label="My characters' guilds" className="mt-8">
          <h2 className="m-0 text-lg text-text">My characters’ guilds</h2>
          {data.characters.length === 0 && <p className="mt-2 text-sm text-dim"><a href="/characters">Load a character</a> first.</p>}
          {data.characters.length > 0 && data.entries.length === 0 && <p className="mt-2 text-sm text-dim">Add a guild above first.</p>}
          {data.characters.length > 0 && data.entries.length === 1 && (
            <p className="mt-2 text-sm text-dim">All your characters raid with {data.entries[0].guildName}.</p>
          )}
          {data.characters.length > 0 && data.entries.length > 1 && (
            <>
              <p className="mt-1 text-sm text-dim">Everyone raids with {data.entries[0].guildName} unless you change it here.</p>
              <CharacterGuilds guilds={data.entries.map(e => ({ id: e.id, name: e.guildName }))}
                rows={data.characters.map(c => ({ name: c.name, guildId: c.playerGuildId ?? data.entries[0].id }))} />
            </>
          )}
        </section>

        <DemoSection />
      </div>
    </HostFrame>
  );
}
