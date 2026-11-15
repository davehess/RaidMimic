// Shared pieces of the raidmimic.com player-first drafts: the draft strip, the gold and quiet buttons, the "Running a
// guild?" divider and the signed-in player panel. Tokens only (no hex); mobile first.
import type { ReactNode } from 'react';
import type { CharacterView } from '@/lib/hubCharactersView';
import type { HomeGuild } from '@/lib/raidmimicHome';
import { DRAFT_LINES, HOME_VARIANTS, LEADER_DIVIDER, PLAYER_GETS, type HomeVariant } from '@/lib/lab/fixtures/rm-home';
import { ComingChip } from '@/app/raidmimic/_landing/StoryBits';
import ProfileAvatar from '@/components/ProfileAvatar';
import { GUILDS_STAY_PATH } from '@/lib/guildSites';

const BASE = 'inline-flex min-h-11 items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold no-underline transition-colors hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold motion-reduce:transition-none';
export const GOLD = `${BASE} border-gold bg-gold text-bg hover:bg-gold/90 disabled:opacity-60`;
export const QUIET = `${BASE} border-border bg-panel text-text hover:border-gold`;
export const CARD = 'rounded-lg border border-border bg-panel p-4';

/** "[draft] option X — <difference>": shown on beta builds only (page.tsx mounts the drafts on a beta build alone). Plain
 *  links, so a switch is a full page load. */
export function DraftStrip({ current }: { current: HomeVariant }) {
  const d = DRAFT_LINES[current];
  return (
    <div role="note" data-draft-strip className="mx-auto mb-4 max-w-5xl rounded-md border border-orange/50 bg-orange/10 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className="tracking-wider text-orange">[draft]</b>
        <span className="text-text">option {current.toUpperCase()} · {d.name}</span>
        {d.rec ? <span className="text-green">recommended</span> : null}
      </div>
      <p className="m-0 mt-1 text-dim">{d.diff}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Relative: the landing is `/` on a raidmimic host and `/raidmimic` on the Wolf Pack hosts. */}
        <a href="?v=default" className="rounded border border-border px-2 py-1 text-dim hover:text-text">default</a>
        {HOME_VARIANTS.map(k => (
          <a key={k} href={`?v=${k}`} aria-current={k === current ? 'page' : undefined}
            className={`rounded border px-2 py-1 ${k === current ? 'border-accent bg-accent/20 text-text' : 'border-border text-dim hover:text-text'}`}>
            <b>{k.toUpperCase()}</b> {DRAFT_LINES[k].name}
          </a>
        ))}
      </div>
    </div>
  );
}

/** The line between the player's page and the guild leader's blocks. */
export function LeaderDivider() {
  return (
    <div data-leader-divider className="mt-16 border-t border-border pt-8">
      <h2 className="m-0 text-2xl text-text">{LEADER_DIVIDER.title}</h2>
      <p className="m-0 mt-1 max-w-[62ch] text-sm leading-6 text-dim">{LEADER_DIVIDER.line}</p>
    </div>
  );
}

/** What a player gets: three cards, one line each. */
export function PlayerGets({ heading }: { heading?: ReactNode }) {
  return (
    <section aria-label="What you get as a player" className="pt-10">
      {heading}
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
        {PLAYER_GETS.map(g => (
          <li key={g.id} data-get={g.id} className={`${CARD} min-w-0`}>
            <h3 className="m-0 text-base text-text"><a href={g.href} className="text-text">{g.name}</a></h3>
            <p className="m-0 mt-2 text-sm leading-6 text-dim">{g.line}</p>
            {g.soon && <p className="m-0 mt-2"><ComingChip>{g.soon}</ComingChip></p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Signed in: the player's own panel. My characters with their flag counts, My raids (a link card until /raids lands),
 *  your guilds and Mimic. No fetch of its own: page.tsx already loaded these for the default panel. */
export function PlayerPanel({ name, avatarUrl, mine, guilds, downloadUrl }: {
  name: string | null; avatarUrl: string | null; mine: CharacterView[]; guilds: HomeGuild[]; downloadUrl: string;
}) {
  return (
    <section aria-label="Your Raid Mimic" data-player-panel className="px-1">
      <div className="flex items-center gap-3">
        <ProfileAvatar src={avatarUrl} name={name} />
        <div>
          <p className="m-0 text-xs uppercase tracking-wider text-dim">Welcome back</p>
          <h1 className="m-0 text-2xl text-text">{name ?? 'Player'}</h1>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className={CARD} data-card="raids">
          <h2 className="m-0 text-base text-text">My raids</h2>
          <p className="m-0 mt-2 text-sm leading-6 text-dim">Upcoming raids with their targets, who is coming today and your guilds’ calendar.</p>
          <p className="m-0 mt-3"><a href="/raids" className={QUIET}>Open My raids</a></p>
        </div>
        <div className={CARD} data-card="characters">
          <h2 className="m-0 text-base text-text">My characters</h2>
          {mine.length === 0 ? (
            <>
              <p className="m-0 mt-2 text-sm leading-6 text-dim">No characters loaded yet. Load them from Zeal’s PoPFlags file and your flags show up here.</p>
              <p className="m-0 mt-3"><a href="/characters" className={GOLD}>Load your characters</a></p>
            </>
          ) : (
            <>
              <ul className="m-0 mt-2 list-none p-0">
                {mine.slice(0, 5).map(c => (
                  <li key={c.name} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border py-2 last:border-b-0">
                    <span className="text-text">{c.name}</span>
                    <span className="text-xs text-dim">{c.flagCount} flag{c.flagCount === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0"><a href="/characters" className="inline-flex min-h-11 items-center text-sm">All characters, and load more →</a></p>
            </>
          )}
        </div>
        <div className={CARD} data-card="guilds">
          <h2 className="m-0 text-base text-text">Guilds</h2>
          {guilds.length === 0 && <p className="m-0 mt-2 text-sm leading-6 text-dim">You are not in a guild yet. Join one with an invite code.</p>}
          <ul className="m-0 mt-2 list-none p-0">
            {guilds.map(g => <li key={g.key} className="border-b border-border py-2 last:border-b-0"><a href={GUILDS_STAY_PATH} className="text-text">{g.name}</a></li>)}
          </ul>
          <p className="m-0"><a href={GUILDS_STAY_PATH} className="inline-flex min-h-11 items-center text-sm">Your guilds →</a></p>
        </div>
        <div className={CARD} data-card="mimic">
          <h2 className="m-0 text-base text-text">Mimic</h2>
          <p className="m-0 mt-2 text-sm leading-6 text-dim">Free overlays for your raids, built from the log the game already writes.</p>
          <p className="m-0 mt-3"><a href={downloadUrl} className={QUIET}>Download Mimic</a></p>
        </div>
      </div>
    </section>
  );
}
