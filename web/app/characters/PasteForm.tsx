'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { importPaste } from './actions';
import type { ImportResult } from '@/lib/hubImport';

// The paste box: the #popflags lines (or the Seer's words, or a whole PoPFlags file's text) and the character's name,
// sent to the server action, which reads it again and keeps only catalog flags. Everything shown back is plain text, and
// a line it did not recognise is only counted, never shown.
export default function PasteForm() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [result, setResult] = useState<(ImportResult & { unrecognised?: number }) | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const r = await importPaste(data);
      setResult(r);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-panel p-4">
      <label htmlFor="paste-text" className="block text-sm font-medium text-text">Paste the #popflags lines, or what the Seer told you</label>
      <p className="mt-1 text-xs text-dim">
        In EverQuest type <code>#popflags</code> (or talk to the Seer), then copy the lines from the chat window. Paste them here with the
        character&rsquo;s name. Only the flag lines are kept; anything else is dropped.
      </p>
      <label htmlFor="paste-name" className="mt-3 block text-xs text-dim">Character name</label>
      <input id="paste-name" name="name" type="text" maxLength={24} autoComplete="off" spellCheck={false}
        className="mt-1 block w-full max-w-xs rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue" />
      <textarea id="paste-text" name="paste" rows={6} spellCheck={false}
        className="mt-3 block w-full rounded border border-border bg-bg p-3 font-mono text-xs text-text focus:outline-none focus:ring-2 focus:ring-blue" />
      <button type="submit" disabled={busy}
        className="mt-3 rounded bg-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue disabled:opacity-50">
        {busy ? 'Reading…' : 'Load from paste'}
      </button>

      <div role="status" aria-live="polite">
        {result && !result.ok && <p className="mt-3 text-sm text-red">{result.error}</p>}
        {result && result.ok && (
          <ul className="mt-3 space-y-1 text-sm">
            {result.characters.map(c => (
              <li key={c.character} className={c.status === 'refused' ? 'text-red' : 'text-text'}>
                <b>{c.character}</b>:{' '}
                {c.status === 'saved' && `loaded, ${c.flags} flag${c.flags === 1 ? '' : 's'} read.`}
                {c.status === 'contested' && 'loaded, but another player has claimed this name too, so it stays hidden from others until it is settled.'}
                {c.status === 'refused' && (c.reason ?? 'not loaded.')}
              </li>
            ))}
            {result.problems.map((p, i) => <li key={i} className="text-red">{p.message}</li>)}
            {(result.unrecognised ?? 0) > 0 && <li className="text-dim">{result.unrecognised} line{result.unrecognised === 1 ? '' : 's'} not recognised and dropped.</li>}
          </ul>
        )}
      </div>
    </form>
  );
}
