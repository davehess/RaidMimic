// "Can this raid zone in?" lines for the elemental planes and Time (web/lib/popRaidEntry.ts has the rule).
// Server component; only the copy button is client code (the shared CopyChip).
import CopyChip from '@/components/CopyChip';
import type { EntryZoneView } from '@/lib/popRaidEntry';

export default function EntryLines({ views, source }: { views: EntryZoneView[]; source: string }) {
  if (!views.length) return null;
  return (
    <section className="mt-4 rounded-lg border border-border bg-panel p-3" aria-label="Can this raid zone in?">
      <h2 className="text-sm font-semibold text-text">Can this raid zone in?</h2>
      <p className="mt-1 text-[11px] text-dim">
        Counted {source}. The server counts everyone in the in-game raid, so a raid that is not this list gives a different answer.
        Getting in this way sets no flag.
      </p>
      <ul className="mt-2 space-y-2">
        {views.map(v => (
          <li key={v.id} id={v.id.startsWith('entry-') ? v.id : undefined}>
            <a href={`#${v.id}`} className={`font-mono text-xs hover:underline ${v.check.pass ? 'text-green' : 'text-red'}`}>{v.line}</a>
            {v.unflagged.length > 0 && (
              <details className="mt-1 text-[11px] text-dim">
                <summary className="cursor-pointer hover:text-text">Unflagged for {v.name} ({v.unflagged.length})</summary>
                <p className="mt-1 font-mono text-text">{v.unflagged.join(', ')}</p>
                <div className="mt-1"><CopyChip text={v.unflagged.join(', ')} label="Copy names" /></div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
