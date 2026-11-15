'use client';
// Option B, "Two doors": two equal panels, I raid and I lead a guild, each with its own short list and button. Choosing a
// door (its "What you get" link, or #raid / #lead in the address) opens that door's blocks under the panels and nothing
// else; with no choice the page ends at the footer. Signed in, the player's door buttons become My characters and My raids.
import { useEffect, useState, type ReactNode } from 'react';
import SignInButton from '@/components/SignInButton';
import { DOORS } from '@/lib/lab/fixtures/rm-home';
import { STORY_WORDS as W } from '@/lib/raidmimicStory';
import { CARD, GOLD, QUIET } from './parts';

type Door = 'raid' | 'lead';
export interface DoorLinks { download: string; demo: string; register: string; signedIn: boolean }

export default function Doors({ links, raid, lead }: { links: DoorLinks; raid: ReactNode; lead: ReactNode }) {
  const [open, setOpen] = useState<Door | null>(null);
  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (h === 'raid' || h === 'lead') setOpen(h);
  }, []);
  const toggle = (d: Door) => setOpen(o => (o === d ? null : d));
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <section id="raid" aria-label={DOORS.raid.title} data-door="raid" className={`${CARD} flex flex-col p-5 sm:p-6 ${open === 'raid' ? 'border-gold' : ''}`}>
          <p className="m-0 text-xs uppercase tracking-wider text-dim">{DOORS.raid.tag}</p>
          <h2 className="m-0 mt-1 text-2xl text-text">{DOORS.raid.title}</h2>
          <ul className="m-0 mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-text marker:text-dim">
            {DOORS.raid.lines.map(l => <li key={l}>{l}</li>)}
          </ul>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
            {links.signedIn
              ? <a href="/characters" className={GOLD}>My characters</a>
              : <SignInButton next={W.after} label={DOORS.raid.primary} className={GOLD} />}
            <a href={links.download} className={QUIET}>{DOORS.raid.secondary}</a>
          </div>
          <button type="button" aria-expanded={open === 'raid'} onClick={() => toggle('raid')}
            className="mt-2 inline-flex min-h-11 items-center self-start bg-transparent p-0 text-sm text-blue underline">{DOORS.more.raid}</button>
        </section>
        <section id="lead" aria-label={DOORS.lead.title} data-door="lead" className={`${CARD} flex flex-col p-5 sm:p-6 ${open === 'lead' ? 'border-gold' : ''}`}>
          <p className="m-0 text-xs uppercase tracking-wider text-dim">{DOORS.lead.tag}</p>
          <h2 className="m-0 mt-1 text-2xl text-text">{DOORS.lead.title}</h2>
          <ul className="m-0 mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-text marker:text-dim">
            {DOORS.lead.lines.map(l => <li key={l}>{l}</li>)}
          </ul>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
            <a href={links.register} className={GOLD}>{DOORS.lead.primary}</a>
            <a href={links.demo} className={QUIET}>{DOORS.lead.secondary}</a>
          </div>
          <button type="button" aria-expanded={open === 'lead'} onClick={() => toggle('lead')}
            className="mt-2 inline-flex min-h-11 items-center self-start bg-transparent p-0 text-sm text-blue underline">{DOORS.more.lead}</button>
        </section>
      </div>
      {open === 'raid' && <div data-door-body="raid">{raid}</div>}
      {open === 'lead' && <div data-door-body="lead">{lead}</div>}
    </>
  );
}
