// The zones of one tier, one line each (the guild lead, 2026-11-16: "least wordy as possible, high level who's
// missing what per section"). Server component; only the copy button is client code (the shared CopyChip).
// Names sit behind a <details> per bucket. "Not recorded" is never "missing": see lib/popRaidTiers.ts.
import CopyChip from '@/components/CopyChip';
import { tierSummary, type TierView, type ZoneView } from '@/lib/popRaidTiers';

const Bucket = ({ label, names, tone }: { label: string; names: string[]; tone: string }) => (
  <details className="open:basis-full">
    <summary className={`cursor-pointer hover:underline ${tone}`}>{label} {names.length}</summary>
    <p className="mt-1 font-mono text-text">{names.join(', ')}</p>
    <div className="mt-1"><CopyChip text={names.join(', ')} label="Copy names" /></div>
  </details>
);

function ZoneLine({ z }: { z: ZoneView }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1 text-xs">
      <span className="font-semibold text-text">{z.short}</span>
      <span className={z.inCount === z.total ? 'text-green' : 'text-dim'}>{z.inCount}/{z.total} in</span>
      {z.missing.map(m => <Bucket key={m.label} label={m.label} names={m.names} tone="text-red" />)}
      {z.notRecorded.length > 0 && <Bucket label="not recorded" names={z.notRecorded} tone="text-dim" />}
      {z.door && (
        <span className={`basis-full font-mono text-[11px] ${z.door.tone === 'pass' ? 'text-green' : z.door.tone === 'fail' ? 'text-red' : 'text-orange'}`}>
          {z.door.text}
        </span>
      )}
    </li>
  );
}

export const TIER_FOOTNOTE = "Not recorded = no flag read in 14 days; paste the Seer's recital to fix.";

/** The zone lines of a tier (tier 1 has no gates). `children` are the tier's folded plan sections. */
export default function TierBlocks({ tier, children }: { tier: TierView; children?: React.ReactNode }) {
  return (
    <div>
      {tier.zones.length === 0
        ? <p className="text-xs text-dim">{tier.name}: open to all</p>
        : <ul className="divide-y divide-border/60">{tier.zones.map(z => <ZoneLine key={z.key} z={z} />)}</ul>}
      {children}
    </div>
  );
}

export { tierSummary };
