// /pop/raid split into tiers, highest first (the guild lead, 2026-11-16: "split into tiers, starting from the highest
// tier and moving down ... collapse everything and have them be expandable"; the folded layout was picked on the
// Decision Desk the same day, over a tier sidebar). One closed <details> per tier with its planes' counts on the
// summary line; tonight's plan sections ride inside their tier, folded.
import Link from 'next/link';
import NewPageTag from '@/components/NewPageTag';
import { PLAN, RAID_DATE_LINE, TRAVEL_BASICS, type PlanSection } from '@/lib/raidPlan';
import type { Raider } from '@/lib/raidPreflags';
import { tierViews, tierSummary, type TierView } from '@/lib/popRaidTiers';
import { POP_ZONE_BY_KEY } from '@/lib/popFlags';
import { WHO_ZONE } from '@/lib/popWho';
import type { WishView } from '@/lib/wishlistLoad';
import type { DrawnRoute } from '@/lib/popRaidMap';
import PlanSectionView, { type Loot } from './PlanSectionView';
import TierBlocks, { TIER_FOOTNOTE } from './TierBlocks';
import type { Walls } from './walls';

// A plan section's zone short name ('nightmareb', 'podisease') to its chart key; unknown ones sit in tier 1.
function chartKey(zone: string): string | null {
  const k = WHO_ZONE[zone] ?? (zone.startsWith('po') ? zone.slice(2) : zone);
  return POP_ZONE_BY_KEY[k] ? k : null;
}
export const tierOfPlan = (s: PlanSection): number => POP_ZONE_BY_KEY[chartKey(s.zone) ?? '']?.tier ?? 1;

type Props = {
  raiders: Raider[]; held: Map<string, Set<string>>; fullRead: Set<string>; note: string; error: string | null;
  walls: (Walls | null)[]; routes: DrawnRoute[]; loot: Loot; wish: WishView | null;
  missing: (key: string) => string[];
};

export default function TierPage(p: Props) {
  const tiers: TierView[] = tierViews(p.raiders, p.held, p.fullRead);
  const plan = (tier: number) => PLAN.map((s, i) => ({ s, i })).filter(x => tierOfPlan(x.s) === tier).map(({ s, i }) => (
    <details key={s.id} className="mt-2 scroll-mt-4">
      <summary className="cursor-pointer text-xs text-gold hover:underline">Plan: {s.zoneName}</summary>
      <PlanSectionView s={s} i={i} walls={p.walls[i]} route={p.routes[i]} loot={p.loot} wish={p.wish}
        raiders={p.raiders} error={p.error} missing={p.missing} />
    </details>
  ));

  return (
    <div className="mx-auto max-w-6xl py-2">
      <NewPageTag note="New page: raid-night plan, split into tiers." />
      <h1 className="text-2xl text-gold">Raid night plan</h1>
      <p className="mt-1 text-sm text-dim">{RAID_DATE_LINE}</p>
      <p className="mt-1 text-xs">
        <Link href="/pop/raid/me" className="text-blue hover:underline">Your flags →</Link>
        <span className="text-dim"> · </span>
        <Link href="/raid/sr" className="text-blue hover:underline">Soft Reserve →</Link>
      </p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-gold hover:underline">Travel basics</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text">{TRAVEL_BASICS.points.map((t, i) => <li key={i}>{t}</li>)}</ul>
      </details>

      {p.error ? (
        <p className="mt-4 text-xs text-red">Could not read the raiders: {p.error}</p>
      ) : p.raiders.length === 0 ? (
        <p className="mt-4 text-xs text-dim">No raiders found.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {tiers.map(t => (
            <details key={t.tier} className="rounded-lg border border-border border-l-4 bg-panel p-3" style={{ borderLeftColor: t.color }}>
              <summary className="cursor-pointer text-sm">
                <span className="font-semibold text-text">{t.name}</span>
                {tierSummary(t) && <span className="text-xs text-dim"> · {tierSummary(t)}</span>}
              </summary>
              <div className="mt-2"><TierBlocks tier={t}>{plan(t.tier)}</TierBlocks></div>
            </details>
          ))}
        </div>
      )}

      {!p.error && p.raiders.length > 0 && <p className="mt-4 text-[11px] text-dim">{p.note} {TIER_FOOTNOTE}</p>}
      <p className="mt-4 text-xs text-dim"><Link href="/pop" className="underline hover:text-text">Back to PoP flags</Link></p>
    </div>
  );
}
