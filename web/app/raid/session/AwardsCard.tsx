// The awards card of the members' session review: the top three raiders in each category, from lib/raidAwards.ts.
// Names arrive already anonymized for opted-out raiders (their class and a number).
import type { Award } from '@/lib/raidAwards';

const MEDAL = ['🥇', '🥈', '🥉'];
const fmtDmg = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n));

export default function AwardsCard({ awards }: { awards: Award[] }) {
  if (!awards.length) return null;
  return (
    <section className="mt-3 rounded-md border border-border bg-panel p-3" aria-label="Awards">
      <h2 className="mb-2 text-sm text-gold">Awards</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {awards.map(a => (
          <div key={a.key} className="min-w-0 rounded border border-border px-2.5 py-2">
            <h3 className="mb-1 text-[11px] uppercase tracking-wider text-dim">{a.title}</h3>
            <ol className="space-y-0.5 text-sm">
              {a.rows.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate"><span aria-hidden="true">{MEDAL[i]}</span> {r.name}</span>
                  <span className="tabular-nums text-dim">{a.fmt === 'dmg' ? fmtDmg(r.value) : r.value.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-dim">From raiders running Mimic; damage and deaths match the rest of this page.</p>
    </section>
  );
}
