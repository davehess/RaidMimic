// The sections of the raidmimic.com landing, player first (the guild lead, 2026-11-16, picks on cards rm-home, rm-home-story,
// lab-rm-first-screen, about-page-placement and raidmimic-layout-clips; "all of these pages read as being long-winded and
// wordy": a title, one line, then the content). Server components; the only client code is the clip player, the
// muted loop and the drawing's frame. Every word is in web/lib/raidmimicPlayer.ts (and raidmimicLanding.ts for the clips).
import type { ReactNode } from 'react';
import { CLIPS_NOTE } from '@/lib/raidmimicLanding';
import {
  DOORS, DOWNLOAD_URL, FIRST, GUILD_PART, HOW, PATHS, SELFHOST_GUIDE_URL, type Door,
} from '@/lib/raidmimicPlayer';
import { EXT, PRIMARY_BTN, type Ctx } from './Parts';
import ClipTabs from './ClipTabs';
import HowItWorks from './HowItWorks';
import SceneClip from './SceneClip';

/** A quiet button for the second action on a block; the one gold button on screen stays the primary. */
export const OUTLINE_BTN =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-blue/70 px-4 py-2 text-sm font-semibold text-blue no-underline transition-colors hover:border-blue hover:bg-blue/10 hover:no-underline motion-reduce:transition-none';
const TEXT_LINK = 'inline-flex min-h-11 items-center text-sm';

/** A section's title and its one line. */
function Head({ id, title, line }: { id?: string; title: string; line?: string }): ReactNode {
  return (
    <>
      <h2 id={id} className="text-xl text-[#f2ede1] sm:text-2xl">{title}</h2>
      {line && <p className="mb-0 mt-1 max-w-[62ch] text-sm leading-6 text-text">{line}</p>}
    </>
  );
}

// ─── The first screen (signed out) ──────────────────────────────────────────────────────────────────
export function FirstScreen({ ctx }: { ctx: Ctx }) {
  const v = FIRST.video;
  return (
    <section aria-label="Raid Mimic" data-first-screen className="grid items-center gap-6 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        <h1 className="m-0 text-3xl leading-tight text-[#f2ede1] sm:text-4xl">{FIRST.headline}</h1>
        <p className="mb-0 mt-3 max-w-[56ch] text-base leading-7 text-text">{FIRST.line}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a href={DOWNLOAD_URL} className={PRIMARY_BTN}>{DOORS[0].next}</a>
          <a href={ctx.demo} className={OUTLINE_BTN}>{FIRST.demo}</a>
        </div>
      </div>
      <div className="mx-auto w-full max-w-xs overflow-hidden sm:max-w-md rounded-md border border-border bg-bg">
        <SceneClip src={v.src} poster={v.poster} w={v.w} h={v.h} alt={FIRST.videoAlt} />
      </div>
    </section>
  );
}

// ─── Three ways in ──────────────────────────────────────────────────────────────────────────────────
// Colour stays semantic (frontend-design): green = free and working today, blue = needs the guild's own server, gold = a
// choice for you; the dashed orange "Coming" chip is the only way a promise is ever drawn.
const ARCH: Record<Door['tone'], string> = { free: 'border-t-green', hub: 'border-t-blue', choice: 'border-t-gold' };

function DoorActions({ door, ctx }: { door: Door; ctx: Ctx }) {
  const interest = { href: ctx.interest, ...(ctx.onHost ? EXT : {}) };
  if (door.id === 'player') {
    return (<><a href={DOWNLOAD_URL} className={PRIMARY_BTN}>{door.next}</a><a href={ctx.setup} className={TEXT_LINK}>{door.more} →</a></>);
  }
  if (door.id === 'guild') {
    return (<><a {...interest} className={OUTLINE_BTN}>{door.next}</a><a href={`#${GUILD_PART.id}`} className={TEXT_LINK}>{door.more} →</a></>);
  }
  return (<><a href={SELFHOST_GUIDE_URL} {...EXT} className={OUTLINE_BTN}>{door.next}</a><a {...interest} className={TEXT_LINK}>{door.more} →</a></>);
}

export function Doors({ ctx }: { ctx: Ctx }) {
  return (
    <section aria-label={PATHS.doorsLabel} className="pt-12">
      <Head title={PATHS.title} line={PATHS.line} />
      <ul className="m-0 mt-4 grid list-none gap-4 p-0 lg:grid-cols-3">
        {DOORS.map(d => (
          <li key={d.id} id={`door-${d.id}`} className="scroll-mt-4">
            <article aria-labelledby={`door-${d.id}-name`} className={`flex h-full flex-col rounded-md border border-t-[3px] border-border bg-panel p-4 ${ARCH[d.tone]}`}>
              <p className="m-0 text-xs uppercase tracking-widest text-gold">{d.label}</p>
              <h3 id={`door-${d.id}-name`} className="mt-1 text-lg text-[#f2ede1]">{d.head}</h3>
              <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-text marker:text-dim">
                {d.points.map(p => <li key={p}>{p}</li>)}
              </ul>
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4"><DoorActions door={d} ctx={ctx} /></div>
              {d.nextNote && <p className="mb-0 mt-1 text-xs text-dim">{d.nextNote}</p>}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── See it run, and How it works ───────────────────────────────────────────────────────────────────
export function SeeItRun() {
  return (
    <section id="see" aria-label={PATHS.seeTitle} className="scroll-mt-4 pt-12">
      <Head title={PATHS.seeTitle} line={PATHS.seeLead} />
      <div className="mt-4"><ClipTabs /></div>
      <p className="mb-0 mt-3 text-xs text-dim">{CLIPS_NOTE}</p>
    </section>
  );
}

// One section under the picked layout: no second hero and no sign-up button (the guild lead, 2026-11-16, card about-page-placement B).
export function HowSection() {
  return (
    <section id={HOW.id} aria-label={HOW.title} className="scroll-mt-4 pt-12">
      <Head title={HOW.title} line={HOW.lead} />
      <div className="mt-4"><HowItWorks /></div>
    </section>
  );
}

// ─── The guild part: everything below this line is for the people who run the night ───────────────────
export function GuildDivider() {
  return (
    <div id={GUILD_PART.id} className="mt-14 scroll-mt-4 border-t border-border pt-6">
      <Head title={GUILD_PART.title} line={GUILD_PART.line} />
    </div>
  );
}
