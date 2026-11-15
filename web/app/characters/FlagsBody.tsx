// One character's PoP flag summary (what it needs next, where it can enter, the flags it has), shared by the card on
// /characters and the character page /characters/<name>. Everything is plain text from the player's own view.
import type { CharacterView } from '@/lib/hubCharactersView';

export default function FlagsBody({ c }: { c: CharacterView }) {
  return (
    <>
      {c.next.top.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs uppercase tracking-wider text-dim">Needs next</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {c.next.top.map(t => (
              <li key={t.line + t.step.key}><span className="text-dim">{t.label}:</span> {t.step.title}</li>
            ))}
          </ul>
          {c.next.more > 0 && <p className="mt-1 text-xs text-dim">and {c.next.more} more line{c.next.more === 1 ? '' : 's'} with something to do.</p>}
        </div>
      )}
      {c.next.blocked.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs uppercase tracking-wider text-dim">Waiting on a flag</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {c.next.blocked.map(b => (
              <li key={b.line}><span className="text-dim">{b.label}:</span> needs {b.blockedOn.map(x => x.label).join(', ')}</li>
            ))}
          </ul>
        </div>
      )}
      {c.next.top.length === 0 && c.next.blocked.length === 0 && (
        <p className="mt-3 text-sm text-dim">{c.flagCount === 0 ? 'No flags read from this export yet.' : 'Nothing left on the lines we track.'}</p>
      )}

      <details className="mt-3" open>
        <summary className="cursor-pointer text-sm text-blue">Can enter ({c.zones.filter(z => z.open).length} of {c.zones.length} zones)</summary>
        <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {c.zones.map(z => (
            <li key={z.key}>
              <b className="font-medium text-text">{z.name}</b>{' '}
              {z.open ? <span className="text-green">yes</span> : <span className="text-dim">missing {z.missing.join(', ')}</span>}
            </li>
          ))}
        </ul>
      </details>

      {c.groups.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-blue">Flags it has</summary>
          <dl className="mt-2 space-y-2 text-sm">
            {c.groups.map(g => (
              <div key={g.zone}>
                <dt className="text-xs uppercase tracking-wider text-dim">{g.zone}</dt>
                <dd>{g.labels.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}
