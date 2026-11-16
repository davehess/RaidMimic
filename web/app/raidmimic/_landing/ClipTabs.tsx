'use client';
// "See it run": the scene player (the guild lead's pick on card raidmimic-layout-clips, 2026-11-16: "Scene-first, with the items
// from the raid-night story added"; "Individual raiders or players get quite a bit out of the overlays, Raid Leaders and guild
// leaders get more out of the coordination ... It should really be a combination of these"). One stage, one tab per BEAT of a
// raid night, numbered in the order they happen; each beat's sentence sits beside its clip on a wide screen and under it on
// a phone, tagged with who it is for (raiders or the people running the night). Only the open clip is mounted, so the others
// are not downloaded until asked for. The stage is sized by the clip's own aspect ratio and capped by the window height, so
// a tall clip never pushes the page off the screen. A new scene is one more row in CLIPS (loot rolls and DKP bids are next).
import { useState, type KeyboardEvent } from 'react';
import { AUDIENCES, CLIPS, CLIPS_HEAD, clipSrc } from '@/lib/raidmimicLanding';
import SceneClip from './SceneClip';

const TAB = 'min-h-11 rounded-md border px-4 text-sm';
const ON = 'border-accent bg-accent text-[#f2ede1]';
const OFF = 'border-border bg-panel text-text hover:border-blue';
// Colour stays semantic: green = a raider's own screen, blue = the people running the night.
const WHO = { raiders: 'border-green/60 text-green', leaders: 'border-blue/60 text-blue' } as const;

// Left / right (and Home / End) move between the tabs, as a tablist is expected to.
function arrows(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const to = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[to].focus();
  tabs[to].click();
}

export default function ClipTabs() {
  const [i, setI] = useState(0);
  const clip = CLIPS[i];
  const who = AUDIENCES.find(a => a.id === clip.audience);
  return (
    <div>
      <div role="tablist" aria-label={CLIPS_HEAD.scenesLabel} onKeyDown={arrows} className="flex flex-wrap gap-2">
        {CLIPS.map((c, n) => (
          <button key={c.id} type="button" role="tab" id={`tab-${c.id}`} aria-selected={n === i} aria-controls="clip-stage"
            tabIndex={n === i ? 0 : -1} onClick={() => setI(n)} className={`${TAB} ${n === i ? ON : OFF}`}>
            <span aria-hidden className="mr-2 opacity-60">{n + 1}</span>{c.step}
          </button>
        ))}
      </div>
      <div id="clip-stage" role="tabpanel" aria-labelledby={`tab-${clip.id}`} className="mt-3 grid items-center gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="rounded-md border border-border bg-bg p-2 sm:p-4">
          <div className="mx-auto" style={{ width: `min(100%, calc(70vh * ${clip.w} / ${clip.h}))` }}>
            <SceneClip key={clip.id} src={clipSrc(clip.id, 'video')} poster={clipSrc(clip.id, 'poster')} w={clip.w} h={clip.h} alt={clip.alt} />
          </div>
        </div>
        <div className="min-w-0">
          {who && <span data-who={who.id} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-4 tracking-wide ${WHO[who.id]}`}>{who.label}</span>}
          <p className="mb-0 mt-2 text-xs uppercase tracking-widest text-gold">{clip.title}</p>
          <h3 className="mt-1 text-lg text-[#f2ede1]">{clip.head}</h3>
          <p className="mb-0 mt-1 text-sm leading-6 text-text">{clip.line}</p>
        </div>
      </div>
    </div>
  );
}
