// The zero / partial / complete encoding the design review asked for, one place: nothing = faint, some = gold,
// all = green. Used for counts in a table cell (tone) and for a bar (Progress). Numbers carry the meaning too.
export type Fill = 'zero' | 'partial' | 'complete';

export const fillOf = (done: number, total: number): Fill => (done <= 0 ? 'zero' : done >= total ? 'complete' : 'partial');

export const FILL_TEXT: Record<Fill, string> = { zero: 'text-text3', partial: 'text-gold', complete: 'text-green' };
const FILL_BAR: Record<Fill, string> = { zero: 'bg-border', partial: 'bg-gold', complete: 'bg-green' };

export default function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const f = fillOf(done, total);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
        className="h-2 min-w-[64px] flex-1 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${FILL_BAR[f]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-10 text-right text-xs tabular-nums ${FILL_TEXT[f]}`}>{pct}%</span>
    </div>
  );
}
