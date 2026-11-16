'use client';

// The list + detail pattern. From md up the two sit side by side; on a phone it is list-then-detail: the list fills the
// screen, picking a row swaps in the detail with a Back button. The selected row carries aria-current and the accent edge.
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Chip, { type Tone } from '@/components/ui/Chip';

type Item = { id: string; name: string; status: string; tone: Tone; note: string };

export default function TwoPane({ items }: { items: Item[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const cur = items.find(i => i.id === sel) ?? null;
  const detail = cur ?? items[0];
  return (
    <div className="grid overflow-hidden rounded-lg border border-border md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <ul className={`divide-y divide-border bg-panel ${cur ? 'hidden md:block' : ''}`} aria-label="Boss timers">
        {items.map(i => (
          <li key={i.id}>
            <button
              type="button" onClick={() => setSel(i.id)} aria-current={detail.id === i.id ? 'true' : undefined}
              className={`flex min-h-[44px] w-full items-center justify-between gap-2 border-l-2 px-3 py-2 text-left text-sm hover:bg-raised ${
                detail.id === i.id ? 'border-accent bg-raised text-text' : 'border-transparent text-text2'}`}
            >
              <span className="truncate">{i.name}</span>
              <Chip tone={i.tone}>{i.status}</Chip>
            </button>
          </li>
        ))}
      </ul>
      <div className={`min-w-0 bg-bg p-4 ${cur ? '' : 'hidden md:block'}`}>
        <div className="mb-3 md:hidden"><Button sm variant="ghost" onClick={() => setSel(null)}>← Back to list</Button></div>
        <h3 className="mb-1 text-base font-semibold text-text">{detail.name}</h3>
        <div className="mb-3"><Chip tone={detail.tone}>{detail.status}</Chip></div>
        <p className="max-w-prose text-sm text-text2">{detail.note}</p>
      </div>
    </div>
  );
}
