'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeCharacter } from './actions';

// "Remove this character": asks once, then deletes that character's saved flags and its row. Nothing else.
export default function RemoveButton({ name }: { name: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    const data = new FormData();
    data.set('name', name);
    start(async () => {
      const r = await removeCharacter(data);
      if (!r.ok) setError(r.error ?? 'Could not remove it.');
      setAsk(false);
      router.refresh();
    });
  }

  if (!ask) {
    return (
      <div className="mt-3">
        <button type="button" onClick={() => setAsk(true)} className="text-xs text-dim underline hover:text-red focus-visible:ring-2 focus-visible:ring-blue">
          Remove this character
        </button>
        {error && <span role="alert" className="ml-2 text-xs text-red">{error}</span>}
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" role="group" aria-label={`Remove ${name}`}>
      <span className="text-dim">Delete {name} and its saved flags and inventory?</span>
      <button type="button" onClick={remove} disabled={busy} className="rounded border border-red/60 px-2 py-1 text-red hover:bg-red/10 focus-visible:ring-2 focus-visible:ring-blue disabled:opacity-50">
        {busy ? 'Removing…' : 'Yes, remove'}
      </button>
      <button type="button" onClick={() => setAsk(false)} className="rounded border border-border px-2 py-1 text-dim focus-visible:ring-2 focus-visible:ring-blue">Keep it</button>
    </div>
  );
}
