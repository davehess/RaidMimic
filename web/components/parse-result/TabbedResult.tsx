'use client';
import { useState, type ReactNode } from 'react';
import type { ResultView } from '@/lib/parseResultFirstView';
import { CARD, ContributorsPanel, DamageTable, Fold, PANELS, ResultStrip, YouLine, type PanelKey } from './shared';

// The parse page (picked from the design lab, 2026-11-15): the result, then one panel at a time under a tab row that
// stays in view below the site header. It always opens on Damage: remembering the last tab opened the next fight on
// Timeline, and the damage breakdown read as missing (the guild lead, 2026-11-17).
const TABS = PANELS.filter((p) => p.key !== 'contributors');

/** `chart` (the damage-over-the-fight curve) heads the Damage tab; `timeline` (deaths, raid events and callouts)
 *  replaces the short event list in the Timeline tab. Both are rendered by the server page and passed in. */
export default function TabbedResult({ v, linkNames, chart, timeline }: { v: ResultView; linkNames?: boolean; chart?: ReactNode; timeline?: ReactNode }) {
  const [tab, setTab] = useState<PanelKey>('damage');
  const cur = TABS.find((t) => t.key === tab) ?? TABS[0];
  const count = (k: PanelKey) => (k === 'deaths' ? v.deaths.length : k === 'loot' ? v.loot.length : null);
  // With the chart, its legend already gives each class's share, so the Damage tab drops the class bar under it.
  const body = cur.key === 'timeline' && timeline ? timeline
    : cur.key === 'damage' && chart ? <DamageTable v={v} linkNames={linkNames} />
    : cur.body(v, linkNames);
  return (
    <div className="space-y-3 sm:space-y-4">
      <ResultStrip v={v} />
      <YouLine v={v} />
      <div className="sticky top-20 z-30 -mx-1 bg-bg px-1 pb-1 pt-1">
        <div role="tablist" aria-label="Fight detail" className="flex overflow-x-auto rounded-lg border border-border bg-panel [scrollbar-width:none]">
          {TABS.map((t) => {
            const on = t.key === cur.key;
            const n = count(t.key);
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                className={`min-h-[44px] flex-1 shrink-0 whitespace-nowrap border-b-2 px-2 text-xs sm:px-4 sm:text-sm ${on ? 'border-blue font-bold text-text' : 'border-transparent text-text hover:bg-bg'}`}>
                {t.label}
                {n != null ? <span className={`ml-1 text-xs ${t.key === 'deaths' && n > 0 ? 'text-red' : 'text-dim'}`}>{n}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <section role="tabpanel" className={`${CARD} py-3`} aria-label={cur.label}>
        {cur.key === 'timeline' && timeline ? null : <p className="mb-2 px-3 text-sm text-text">{cur.headline(v)}</p>}
        {cur.key === 'damage' && chart ? <div className="mb-3 px-3">{chart}</div> : null}
        {body}
      </section>
      <section className={CARD}>
        <Fold label="Contributors" headline={PANELS[6].headline(v)}><ContributorsPanel v={v} /></Fold>
      </section>
    </div>
  );
}
