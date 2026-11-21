'use client';
// The awards card of the members' session review: the top three raiders in each category, "show all" for every
// raider with a value (lib/raidAwards.ts). Names arrive already anonymized for opted-out raiders (their class and a number).
import { useState } from 'react';
import { TOP_N, type Award } from '@/lib/raidAwards';

const MEDAL = ['🥇', '🥈', '🥉'];
const fmtDmg = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n));

export default function AwardsCard({ awards }: { awards: Award[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  if (!awards.length) return null;
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <section className="mt-3 rounded-md border border-border bg-panel p-3" aria-label="Awards">
      <h2 className="mb-2 text-sm text-gold">Awards</h2>
      <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {awards.map(a => {
          const all = open.has(a.key);
          return (
            <div key={a.key} className="min-w-0 rounded border border-border px-2.5 py-2">
              <h3 className="mb-1 text-[11px] uppercase tracking-wider text-dim">{a.title}</h3>
              <ol className="space-y-0.5 text-sm">
                {(all ? a.rows : a.rows.slice(0, TOP_N)).map((r, i) => (
                  <li key={`${r.name}-${i}`} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">{i < MEDAL.length ? <><span aria-hidden="true">{MEDAL[i]}</span> </> : <span className="text-dim tabular-nums">{i + 1}. </span>}{r.name}</span>
                    <span className="tabular-nums text-dim">{a.fmt === 'dmg' ? fmtDmg(r.value) : r.value.toLocaleString('en-US')}</span>
                  </li>
                ))}
              </ol>
              {a.rows.length > TOP_N && (
                <button type="button" onClick={() => toggle(a.key)} aria-expanded={all} className="mt-1 text-[11px] text-dim underline hover:text-text">
                  {all ? 'Show top 3' : `Show all ${a.rows.length}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-dim">From raiders running Mimic; damage and deaths match the rest of this page.</p>
    </section>
  );
}
