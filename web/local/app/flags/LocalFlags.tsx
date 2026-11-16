'use client';

// PoP flags, built on this PC (the guild lead, 2026-11-16: "We should have Popflags in the local mimic as well").
// The rows come from the agent on the same origin (GET /api/local/pop-flags: Zeal's <Name>-PoPFlags.txt, the
// #popflags replies and the Seer's recital the log reader kept) and go through the SAME view code as
// raidmimic.com/characters (web/lib/hubCharactersView.ts). No account, no network: nothing is uploaded.
//
// The agent sends step keys; the website's store holds those PLUS what each implies (STAGE_IMPLIES), so the page
// expands them here before building the view. The gate picker is page state kept in the URL hash (a static export has
// no server to read ?gate=), so a pick never reloads the page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import GateTable from '@/app/pop/guide/GateTable';
import FlagsBody from '@/app/characters/FlagsBody';
import { GATES } from '@/lib/popGatePieces';
import { gateKeyOr } from '@/lib/popGateStatus';
import { STAGE_IMPLIES } from '@/lib/popRecital';
import { characterView, matrixRows, overallRows, wantsOverall } from '@/lib/hubCharactersView';

type FlagRow = { flag_key: string; earned_at: string; source: string };
type LocalFlagsResponse = { ok?: boolean; characters: { name: string; rows: FlagRow[]; export_at: string | null }[] };

const GATE_CHOICES = GATES.map(g => ({ key: g.key, name: g.name, short: g.short }));
const hashGate = () => (typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));

/** Step keys plus what each proves, as the website stores them (hubImport flagRowsFromExport). */
export function expandRows(rows: FlagRow[]): { flag_key: string; earned_at: string }[] {
  const seen = new Set<string>();
  const out: { flag_key: string; earned_at: string }[] = [];
  const push = (flag_key: string, earned_at: string) => { if (!seen.has(flag_key)) { seen.add(flag_key); out.push({ flag_key, earned_at }); } };
  for (const r of rows) {
    push(r.flag_key, r.earned_at);
    for (const k of STAGE_IMPLIES[r.flag_key] ?? []) push(k, r.earned_at);
  }
  return out;
}

export default function LocalFlags() {
  const [data, setData] = useState<LocalFlagsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState('');

  const load = useCallback(() => {
    fetch('/api/local/pop-flags', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`the agent answered ${r.status}`))))
      .then((j: LocalFlagsResponse) => { setData(j); setErr(null); })
      .catch((e: Error) => setErr(e.message || 'could not reach the agent'));
  }, []);

  // Load once and again when the window regains focus: you type #popflags in game, tab back, and it is current.
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useEffect(() => {
    setPick(hashGate());
    const onHash = () => setPick(hashGate());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const views = useMemo(
    () => (data?.characters ?? []).map(c => characterView(c.name, 'local', expandRows(c.rows))),
    [data]);
  const exportAt = useMemo(() => new Map((data?.characters ?? []).map(c => [c.name, c.export_at])), [data]);
  const gateKey = gateKeyOr(pick);
  const overall = wantsOverall(pick);

  return (
    <div className="space-y-6">
      <section className="bg-panel border border-border rounded-lg p-6">
        <div className="flex items-start gap-3">
          <h2 className="text-2xl text-gold mb-1"><span aria-hidden>🗺️ </span>PoP flags</h2>
          <button type="button" onClick={load}
            className="ml-auto text-[11px] px-2 py-0.5 rounded border border-border text-dim hover:text-text">
            Reload
          </button>
        </div>
        <p className="text-sm text-dim leading-6">
          From this PC only: Zeal&apos;s PoPFlags files, <code>#popflags</code> replies and the Seer&apos;s recital in your
          logs. Nothing is uploaded.
        </p>
        {err && <p className="mt-3 text-sm text-orange">Could not read the flags: {err}.</p>}
        {data && views.length === 0 && (
          <p className="mt-3 text-sm text-text">
            Nothing yet. Type <code>#popflags</code> in game (or <code>/outputfile popflags</code> with Zeal), or hail the
            Seer and say &apos;unlock memories&apos;, then press Capture on the dashboard.
          </p>
        )}
      </section>

      {views.length > 0 && (
        <>
          <GateTable gates={GATE_CHOICES} selected={gateKey} rows={matrixRows(views, gateKey)}
            hrefFor={k => `#${k}`} singleHref="#your-characters"
            overall={{ href: '#overall', active: overall, rows: overallRows(views) }} />

          <section id="your-characters" aria-label="Your characters" className="space-y-3">
            {views.map(c => (
              <article key={c.name} className="rounded-lg border border-border bg-panel p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-lg text-text">{c.name}</h3>
                  <span className="text-xs text-dim">
                    {c.flagCount} flag{c.flagCount === 1 ? '' : 's'}
                    {exportAt.get(c.name) ? ` · export of ${String(exportAt.get(c.name)).slice(0, 10)}` : ''}
                  </span>
                </div>
                <FlagsBody c={c} />
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
