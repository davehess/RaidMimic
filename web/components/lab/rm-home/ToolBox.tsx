'use client';
// Option C, "Tool first": the PoP flag paste box is the first thing on the page. What is pasted is kept in this tab's
// sessionStorage (never sent anywhere) and Sign in with Discord is the one button; the flags are read on My characters
// after sign-in. DRAFT: the hand-off from this box to the My characters upload is not built, so today the paste is only
// held and counted. The real build reads it on /characters and feeds the same importer as the file picker.
import { useState } from 'react';
import SignInButton from '@/components/SignInButton';
import { TOOL } from '@/lib/lab/fixtures/rm-home';
import { STORY_WORDS as W } from '@/lib/raidmimicStory';
import { GOLD, QUIET } from './parts';

const KEY = 'rm-pending-popflags';

export default function ToolBox({ download }: { download: string }) {
  const [lines, setLines] = useState(0);
  function onText(text: string) {
    setLines(text.split('\n').filter(l => l.trim()).length);
    try { sessionStorage.setItem(KEY, text.slice(0, 200_000)); } catch { /* private window: the box still works, the paste is just not kept */ }
  }
  return (
    <div data-tool-box className="rounded-lg border border-border bg-panel p-4 sm:p-5">
      <label htmlFor="rm-tool-paste" className="block text-sm font-medium text-text">{TOOL.label}</label>
      <textarea id="rm-tool-paste" rows={6} placeholder={TOOL.placeholder} spellCheck={false}
        onChange={e => onText(e.target.value)}
        className="mt-2 block w-full resize-y rounded border border-dashed border-border bg-bg p-3 text-sm text-text placeholder:text-dim" />
      <p role="status" aria-live="polite" className="m-0 mt-2 text-xs text-dim">{TOOL.count(lines)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SignInButton next="/characters" label={TOOL.signIn} className={GOLD} />
        <a href={download} className={QUIET}>{TOOL.alt}</a>
      </div>
    </div>
  );
}
