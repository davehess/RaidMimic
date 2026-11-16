// /pop/raid: the raid-night plan (the guild lead, 2026-10-13: "this is our target list for tomorrow. make us a
// raid page that has preflag checking, travel guide, expectations, and maps with paths preferably").
//
// Split into tiers, highest first (the guild lead, 2026-11-16: "split into tiers, starting from the highest tier and
// moving down. Least wordy as possible, give high level 'who's missing what' per section. Collapse everything"; the
// folded layout, B, was picked on the Decision Desk the same day). Members only. Raiders are tonight's Raid-Helper
// sign-ups, else the whole raid roster; each plane says who is in and who lacks which piece (TierPage.tsx), and
// tonight's plan sections fold inside their tier. The content is data in web/lib/raidPlan.ts.
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { supabaseServer } from '@/lib/supabase-server';
import { requireMember } from '@/lib/member';
import { selectAll } from '@/lib/selectAll';
import { PLAN } from '@/lib/raidPlan';
import { loadRaiders, loadHeld, loadFullReads, type Raider } from '@/lib/raidPreflags';
import type { ItemCard } from '@/app/character/[name]/inventory/ItemHover';
import { ownedCharacters } from '@/lib/ownedCharacters';
import { loadMySignup, loadNextEvent } from '@/lib/raidMeLoad';
import { bringingFrom } from '@/lib/raidMe';
import { loadWishView, type WishView } from '@/lib/wishlistLoad';
import { loadWalls } from './walls';
import { loadSavedRoute } from './savedRoute';
import { chooseRoute } from '@/lib/popRaidMap';
import { type Drop } from './PlanSectionView';
import TierPage from './TierPage';

export const metadata: Metadata = {
  title: '[beta] Raid night plan',
  description: 'Tonight\'s raid by tier, highest first: who is in each plane, who lacks which flag, and the plan for each target.',
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

export default async function RaidPlanPage() {
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/auth/signin?next=' + encodeURIComponent('/pop/raid'));
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
  const { raiders, held, note, error } = data;
  const has = (name: string, key: string) => held.get(name.toLowerCase())?.has(key) ?? false;
  const missing = (key: string) => raiders.filter(r => !has(r.name, key)).map(r => r.name);
  // A failed read of the recent full reads leaves the set empty: everyone then reads "not recorded", never "missing".
  const fullRead = !error && raiders.length ? await loadFullReads(raiders.map(r => r.name)).catch(() => new Set<string>()) : new Set<string>();

  return (
    <TierPage raiders={raiders} held={held} fullRead={fullRead} note={note} error={error}
      walls={walls} routes={routes} loot={loot} wish={wish} missing={missing} />
  );
}
