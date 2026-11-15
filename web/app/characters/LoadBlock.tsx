'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { importCharacters, importPaste } from './actions';
import type { ImportResult } from '@/lib/hubImport';

type Shown = ImportResult & { unrecognised?: number };

// One compact load block: the file button, "or", a character name and a small paste box that opens up when it is used.
// Both forms still post to the same two server actions, which keep every cap and rule. Everything shown back is plain text.
export default function LoadBlock({ max, held }: { max: number; held: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<Shown | null>(null);
  const [open, setOpen] = useState(false);

  function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      setResult(await importCharacters(data));
      if (input.current) input.current.value = '';
      router.refresh();
    });
  }
  function paste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      setResult(await importPaste(data));
      router.refresh();
    });
  }

  const field = 'rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue';
  return (
    <div className="rounded-lg border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
          <label htmlFor="popflags-files" className="sr-only">Your PoPFlags files</label>
          <input id="popflags-files" ref={input} name="files" type="file" multiple accept=".txt,text/plain"
            className="max-w-full text-sm text-dim file:mr-2 file:rounded file:border-0 file:bg-blue file:px-3 file:py-1.5 file:text-sm file:text-white" />
          <button type="submit" disabled={busy}
            className="rounded bg-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Reading…' : 'Load'}
          </button>
        </form>
        <span className="text-sm text-dim">or</span>
        <form onSubmit={paste} className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
          <label htmlFor="paste-name" className="sr-only">Character name</label>
          <input id="paste-name" name="name" type="text" maxLength={24} autoComplete="off" spellCheck={false}
            placeholder="Character name" className={`${field} w-36`} onFocus={() => setOpen(true)} />
          <label htmlFor="paste-text" className="sr-only">Paste the #popflags lines, or what the Seer told you</label>
          <textarea id="paste-text" name="paste" rows={open ? 6 : 1} spellCheck={false} placeholder="Paste flag lines"
            onFocus={() => setOpen(true)} className={`${field} min-w-0 flex-1 basis-40 font-mono text-xs`} />
          <button type="submit" disabled={busy}
            className="rounded bg-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Reading…' : 'Load paste'}
          </button>
        </form>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-blue">How to get the files or lines ({held} of {max} characters loaded)</summary>
        <p className="mt-1 text-xs text-dim">
          Files: camp with Zeal&apos;s &ldquo;Export data on /camp&rdquo; on. Each character leaves <code>Name-PoPFlags.txt</code> in the EverQuest
          folder; choose one or several. Paste: type <code>#popflags</code> (or talk to the Seer), copy the lines from the chat window and paste
          them with the character&rsquo;s name. Only flag lines are kept; anything else is dropped.
        </p>
      </details>

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
            {result.problems.map((p, i) => <li key={i} className="text-red">{p.file !== 'paste' ? <b>{p.file}: </b> : null}{p.message}</li>)}
            {result.characters.length === 0 && result.problems.length === 0 && <li className="text-dim">Nothing to load.</li>}
            {(result.unrecognised ?? 0) > 0 && <li className="text-dim">{result.unrecognised} line{result.unrecognised === 1 ? '' : 's'} not recognised and dropped.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
