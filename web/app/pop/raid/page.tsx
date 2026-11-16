// /pop/raid: the raid-night plan (the guild lead, 2026-10-13: "this is our target list for tomorrow. make us a
// raid page that has preflag checking, travel guide, expectations, and maps with paths preferably").
//
// New page, so it goes live with the [beta] tag. Members only. Three parts: who still lacks which preflag
// (Raid-Helper sign-ups for the night, else the whole raid roster), then one section per target with what to
// do before, how to get there, what to expect and the loot, beside a map of the zone with the route.
// The content is data in web/lib/raidPlan.ts; the step catalog is web/lib/popSteps.ts.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { supabaseServer } from '@/lib/supabase-server';
import { requireMember } from '@/lib/member';
import { selectAll } from '@/lib/selectAll';
import NewPageTag from '@/components/NewPageTag';
import { PLAN, PREFLAGS, RAID_DATE_LINE, TRAVEL_BASICS, bossAnchor } from '@/lib/raidPlan';
import { loadRaiders, loadHeld, loadFullReads, type Raider } from '@/lib/raidPreflags';
import type { ItemCard } from '@/app/character/[name]/inventory/ItemHover';
import { ownedCharacters } from '@/lib/ownedCharacters';
import { loadMySignup, loadNextEvent } from '@/lib/raidMeLoad';
import { bringingFrom } from '@/lib/raidMe';
import { loadWishView, type WishView } from '@/lib/wishlistLoad';
import { loadWalls } from './walls';
import { loadSavedRoute } from './savedRoute';
import { chooseRoute } from '@/lib/popRaidMap';
import { mapBlockers } from '@/lib/popTonightBlockersView';
import BlockersStrip, { FlagFold } from '@/components/lab/pop-tonight-blockers/BlockersStrip';
import EntryLines from './EntryLines';
import PlanSectionView, { type Drop } from './PlanSectionView';
import TierPage from './TierPage';
import { entryViews, ENTRY_ZONES } from '@/lib/popRaidEntry';

export const metadata: Metadata = {
  title: '[beta] Raid night plan',
  description: 'Tonight\'s targets in order: who still needs a preflag, how to get there, what to expect and a map with the route.',
};

export const dynamic = 'force-dynamic';

// Who is going and who holds each preflag: lib/raidPreflags.ts (shared with the /screen Overview).
type Loaded = { raiders: Raider[]; held: Map<string, Set<string>>; note: string; unlinked: string[]; error: string | null };

async function load(): Promise<Loaded> {
  try {
    const { raiders, note, unlinked } = await loadRaiders();
    const held = raiders.length ? await loadHeld(raiders.map(r => r.name)) : new Map<string, Set<string>>();
    return { raiders, held, note, unlinked, error: null };
  } catch (e) {
    return { raiders: [], held: new Map(), note: '', unlinked: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// Loot straight from the server's drop tables (eqemu_npc_drops), not typed by hand, plus the hover cards.
async function loadLoot(): Promise<{ drops: Map<number, Drop[]>; cards: Record<number, ItemCard> }> {
  const sb = supabaseAdmin();
  const npcs = PLAN.flatMap(s => s.bosses.map(b => b.npc));
  const { data } = await sb.from('eqemu_npc_drops')
    // 63 rows for tonight's nine bosses (2026-10-13); 100 leaves room without paging.
    .select('npc_id, item_id, item_name, effective_chance').in('npc_id', npcs).limit(100);
  const drops = new Map<number, Drop[]>();
  for (const d of (data ?? []) as Drop[]) {
    if (!drops.has(d.npc_id)) drops.set(d.npc_id, []);
    drops.get(d.npc_id)!.push(d);
  }
  for (const list of drops.values()) {
    list.sort((a, b) => (b.effective_chance ?? 0) - (a.effective_chance ?? 0) || a.item_name.localeCompare(b.item_name));
  }
  const ids = [...new Set((data ?? []).map(d => (d as Drop).item_id))];
  const cards: Record<number, ItemCard> = {};
  if (ids.length) {
    // Paged like every set-returning call (beta's read-discipline ratchet), though ~60 ids is one page.
    const rows = await selectAll<ItemCard>((from, to) => sb.rpc('item_card_info', { p_item_ids: ids }).range(from, to));
    for (const r of rows) cards[r.item_id] = r;
  }
  return { drops, cards };
}

/**
 * The wishlist view for the loot lines. The default character is the one the member's sign-up for the next raid
 * brings (raidMe.ts bringingFrom, the rule /pop/raid/me uses); with no sign-up it is their main. A failed read of
 * the event or sign-up falls back to the main; a failed read of the wishlist hides the controls, never the page.
 */
async function loadRaidWish(userId: string, itemIds: number[]): Promise<WishView | null> {
  try {
    const owned = await ownedCharacters(userId);
    let preferred: string | null = null;
    try {
      const event = await loadNextEvent();
      const signup = event ? await loadMySignup(event.id, userId) : null;
      preferred = bringingFrom(owned, signup)?.name ?? null;
    } catch { /* no sign-up read: start on the main */ }
    return await loadWishView(userId, itemIds, { preferred, owned });
  } catch {
    return null;
  }
}

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-0.5 pl-4 text-xs text-text">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
);

export default async function RaidPlanPage({ searchParams }: { searchParams?: Promise<{ v?: string; tier?: string }> }) {
  const sp = await searchParams;
  // ?v=a: the blockers strip first, the full raider table folded (draft). ?v=b / ?v=c: the page split into tiers
  // (the guild lead, 2026-11-16); no ?v= is the page as it was.
  const alt = sp?.v === 'a' || sp?.v === 'b' || sp?.v === 'c' ? sp.v : undefined;
  const tierPick = Number(sp?.tier);
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/auth/signin?next=' + encodeURIComponent('/pop/raid' + (alt ? `?v=${alt}` + (alt === 'c' && tierPick >= 1 && tierPick <= 5 ? `&tier=${tierPick}` : '') : '')));
  await requireMember(user.id);

  const [data, walls, saved, loot] = await Promise.all([
    load(), Promise.all(PLAN.map(s => loadWalls(s.zone))),
    Promise.all(PLAN.map(s => loadSavedRoute(s.zone))),
    loadLoot().catch(() => ({ drops: new Map<number, Drop[]>(), cards: {} as Record<number, ItemCard> })),
  ]);
  // The wishlist control on each loot line: the viewer's own characters, starting on the one their sign-up brings.
  const wish = await loadRaidWish(user.id, [...loot.drops.values()].flat().map(d => d.item_id));
  // The route a map draws: the one an officer saved from the raid's recorded movement (or the route planner), else the plan's own.
  const routes = PLAN.map((s, i) => chooseRoute(saved[i], s.route));
  const { raiders, held, note, unlinked, error } = data;
  const has = (name: string, key: string) => held.get(name.toLowerCase())?.has(key) ?? false;
  const strip = alt === 'a' && !error && raiders.length ? mapBlockers(PLAN, PREFLAGS, raiders, has) : null;
  // "Can this raid zone in?": only for plan sections in the planes with the 85% door (none until the plan has one).
  // Every 85/15 zone, whether or not tonight's plan has a section for it (the raid may head to Air with no plan
  // section written): a plan section's anchor when there is one, else the line's own.
  const entrySections = Object.keys(ENTRY_ZONES).map(z => ({ id: PLAN.find(s => s.zone === z)?.id ?? `entry-${z}`, zone: z }));
  const entry = !error && raiders.length ? entryViews(entrySections, raiders, has) : [];
  const missing = (key: string) => raiders.filter(r => !has(r.name, key)).map(r => r.name);

  if (alt === 'b' || alt === 'c') {
    // A failed read of the recent full reads leaves the set empty: everyone then reads "not recorded", never "missing".
    const fullRead = !error && raiders.length ? await loadFullReads(raiders.map(r => r.name)).catch(() => new Set<string>()) : new Set<string>();
    return (
      <TierPage variant={alt} selected={tierPick >= 1 && tierPick <= 5 ? tierPick : 5} raiders={raiders} held={held}
        fullRead={fullRead} note={note} error={error} walls={walls} routes={routes} loot={loot} wish={wish} missing={missing} />
    );
  }

  return (
    <div className="mx-auto max-w-6xl py-2">
      <NewPageTag note="New page: raid-night plan with a preflag check, travel, expectations and maps." />
      <h1 className="text-2xl text-gold">Raid night plan</h1>
      <p className="mt-1 text-sm text-dim">{RAID_DATE_LINE}</p>
      <p className="mt-1 text-xs">
        <Link href="/pop/raid/me" className="text-blue hover:underline">Your flags for tonight: your characters and the steps each one still needs →</Link>
      </p>
      <p className="mt-1 text-xs">
        <Link href="/raid/sr" className="text-blue hover:underline">Soft Reserve: pick the drops you want first claim on →</Link>
      </p>

      {strip && <div className="mt-3"><BlockersStrip view={strip} /></div>}

      <nav className="mt-3 rounded-lg border border-border bg-panel p-3 text-xs" aria-label="Targets">
        <ol className="space-y-1">
          <li><a href="#preflags" className="text-gold hover:underline">Preflag check</a></li>
          {PLAN.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-gold hover:underline">{i + 1}. {s.zoneName}</a>
              <span className="text-dim"> · </span>
              {s.bosses.map((b, j) => (
                <span key={b.npc}>
                  {j > 0 && <span className="text-dim">, </span>}
                  <a href={`#${bossAnchor(s.id, b.npc)}`} className="text-text hover:text-gold hover:underline">{b.name}</a>
                </span>
              ))}
            </li>
          ))}
        </ol>
      </nav>

      <section className="mt-4 rounded-lg border border-border bg-panel p-3">
        <h2 className="text-sm font-semibold text-text">{TRAVEL_BASICS.title}</h2>
        <p className="mt-1 text-xs text-dim">
          Everything starts in Tranquility. First time into a zone? Zone into the live one through its standard portal before the guild door works.
        </p>
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-gold">Click here for more info</summary>
          <List items={TRAVEL_BASICS.points} />
        </details>
      </section>

      <FlagFold on={!!strip} count={raiders.length}>
      <section id="preflags" className="mt-4 rounded-lg border border-border bg-panel p-3">
        <h2 className="text-sm font-semibold text-text">Preflag check</h2>
        <p className="mt-1 text-xs text-dim">{error ? '' : note}</p>
        {error ? (
          <p className="mt-2 text-xs text-red">Could not read the raiders: {error}</p>
        ) : raiders.length === 0 ? (
          <p className="mt-2 text-xs text-dim">No raiders found.</p>
        ) : (
          <>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-dim">
                    <th className="py-1 pr-2 font-normal">Raider</th>
                    {PREFLAGS.map(p => <th key={p.key} className="px-1 py-1 text-center font-normal" title={p.label}>{p.short}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {raiders.map(r => (
                    <tr key={r.name} className="border-t border-border/60">
                      <td className="py-0.5 pr-2 text-text">{r.name}{r.cls && <span className="text-dim"> {r.cls}</span>}</td>
                      {PREFLAGS.map(p => (
                        <td key={p.key} className={`px-1 py-0.5 text-center ${has(r.name, p.key) ? 'text-green' : 'text-red'}`}>
                          <span aria-label={has(r.name, p.key) ? 'has it' : 'missing'}>{has(r.name, p.key) ? '✓' : '✗'}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 space-y-2 text-xs">
              {PREFLAGS.map(p => {
                const m = missing(p.key);
                return (
                  <li key={p.key}>
                    <b className="text-text">{p.label}</b>{' '}
                    <span className="text-dim">(
                      {PLAN.filter(s => s.needs.includes(p.key)).map((s, j) => (
                        <span key={s.id}>{j > 0 && ', '}<a href={`#${s.id}`} className="hover:text-gold hover:underline">{s.zoneName}</a></span>
                      ))}
                    )</span>
                    <div className={m.length ? 'text-red' : 'text-green'}>
                      {m.length ? `missing (${m.length}): ${m.join(', ')}` : 'everyone has it'}
                    </div>
                    <div className="text-dim">{p.why}</div>
                  </li>
                );
              })}
            </ul>
            {unlinked.length > 0 && (
              <p className="mt-3 text-xs text-dim">Signed up with no linked character, so not checked: {unlinked.join(', ')}.</p>
            )}
            <p className="mt-3 text-[11px] text-dim">
              A ✓ comes from Mimic, a /who sighting inside the plane, or the owner&apos;s own tick on the{' '}
              <Link href="/pop/guide" className="underline hover:text-text">checklist</Link>. A later step in a series counts for the earlier ones.
            </p>
          </>
        )}
      </section>
      </FlagFold>

      <EntryLines views={entry} source={`from ${note.replace(/\.$/, '').toLowerCase().startsWith('sign-ups') ? 'the sign-ups' : 'the raid roster'} (${raiders.length} raiders)`} />

      {PLAN.map((s, i) => (
        <PlanSectionView key={s.id} s={s} i={i} walls={walls[i]} route={routes[i]} loot={loot} wish={wish}
          raiders={raiders} error={error} missing={missing} />
      ))}

      <p className="mt-8 text-xs text-dim">
        Read from Quarm&apos;s own quest scripts and spawn tables; distances are straight-line. Anything marked (inferred) is our reading, not a script line.
        Maps: Brewall&apos;s EverQuest maps via Zeal; where Brewall has none, EQEmu maps (GPLv2+, © EQEmulator.NET, AX-Classic and ProjectEQ).{' '}
        <Link href="/pop" className="underline hover:text-text">Back to PoP flags</Link>.
      </p>
    </div>
  );
}
