'use client';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { importInventoryFiles } from './actions';
import type { InvResult } from '@/lib/hubInventory';

// The inventory / Quarmy upload box. `only` is the character page's own name (a file for any other character is refused);
// on /characters it is left out and each file names its own character. Everything shown back is plain text.
export default function InventoryUpload({ only, heading }: { only?: string; heading?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [result, setResult] = useState<InvResult | null>(null);
  const id = `inv-files-${only ?? 'all'}`;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      setResult(await importInventoryFiles(data));
      if (input.current) input.current.value = '';
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-panel p-4">
      <label htmlFor={id} className="block text-sm font-medium text-text">{heading ?? 'Inventory and Quarmy files'}</label>
      <p className="mt-1 text-xs text-dim">
        In EverQuest type <code>/output inventory</code> (Zeal) for <code>Name-Inventory.txt</code>, or run the Quarmy export for <code>NameQuarmy.txt</code>;
        both land in the EverQuest folder. Choose one or both. The character needs its PoP flags loaded first.
      </p>
      {only && <input type="hidden" name="only" value={only} />}
      <input id={id} ref={input} name="files" type="file" multiple accept=".txt,text/plain"
        className="mt-3 block w-full rounded border border-dashed border-border bg-bg p-3 text-sm text-dim file:mr-3 file:rounded file:border-0 file:bg-blue file:px-3 file:py-1 file:text-sm file:text-white" />
      <button type="submit" disabled={busy}
        className="mt-3 rounded bg-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {busy ? 'Reading…' : 'Upload'}
      </button>
      <div role="status" aria-live="polite">
        {result && !result.ok && <p className="mt-3 text-sm text-red">{result.error}</p>}
        {result && result.ok && (
          <ul className="mt-3 space-y-1 text-sm">
            {result.saved.map(s => (
              <li key={s.character + s.source} className="text-text">
                <b>{s.character}</b>: {s.items} item{s.items === 1 ? '' : 's'} saved from the {s.source === 'quarmy' ? 'Quarmy export' : 'inventory file'}.
              </li>
            ))}
            {result.problems.map((p, i) => <li key={i} className="text-red"><b>{p.file}</b>: {p.message}</li>)}
            {result.saved.length === 0 && result.problems.length === 0 && <li className="text-dim">Nothing to load.</li>}
          </ul>
        )}
      </div>
    </form>
  );
}
