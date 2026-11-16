// One section of tonight's plan (before, travel, each boss with its loot, and the map), moved out of page.tsx
// unchanged so the default page and the tier variants (?v=b, ?v=c) draw the same markup (the guild lead, 2026-11-16).
import { PREFLAGS, bossAnchor, loc, type PlanSection } from '@/lib/raidPlan';
import type { Raider } from '@/lib/raidPreflags';
import ItemHover, { type ItemCard } from '@/app/character/[name]/inventory/ItemHover';
import WishlistControls from '@/components/WishlistControls';
import type { WishView } from '@/lib/wishlistLoad';
import ZoneSvg from './ZoneSvg';
import type { Walls } from './walls';
import { markerLetter, type DrawnRoute } from '@/lib/popRaidMap';

export type Drop = { npc_id: number; item_id: number; item_name: string; effective_chance: number | null };
export type Loot = { drops: Map<number, Drop[]>; cards: Record<number, ItemCard> };

const pct = (n: number | null) => n == null ? '' : n >= 99.95 ? 'always' : `${Number(n.toFixed(1))}%`;

const List = ({ items }: { items: string[] }) => (
  <ul className="list-disc space-y-0.5 pl-4 text-xs text-text">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-dim">{children}</h4>
);

export default function PlanSectionView({ s, i, walls, route, loot, wish, raiders, error, missing }: {
  s: PlanSection; i: number;
  walls: Walls | null; route: DrawnRoute; loot: Loot; wish: WishView | null;
  raiders: Raider[]; error: string | null; missing: (key: string) => string[];
}) {
  return (
        <section key={s.id} id={s.id} className="mt-6 scroll-mt-4">
          <h2 className="text-lg text-gold">{i + 1}. {s.title}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {s.needs.map(k => {
              const p = PREFLAGS.find(x => x.key === k);
              const m = missing(k).length;
              return (
                <span key={k} className={`rounded border px-1.5 py-0.5 ${raiders.length && m === 0 ? 'border-green/60 text-green' : 'border-border text-dim'}`}>
                  needs: {p?.short ?? k}{raiders.length > 0 && !error && <> · {m === 0 ? 'all set' : `${m} missing`}</>}
                </span>
              );
            })}
          </div>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-panel p-3">
              <H>Before</H>
              <List items={s.before} />
              <H>Travel</H>
              <List items={s.travel} />
              {s.bosses.map(b => (
                <div key={b.npc} id={bossAnchor(s.id, b.npc)} className="mt-4 scroll-mt-4 border-t border-border/60 pt-2">
                  <div className="text-sm font-semibold text-text">
                    <a href={`https://www.pqdi.cc/npc/${b.npc}`} target="_blank" rel="noreferrer" className="text-blue hover:underline">{b.name} ↗</a>
                    <span className="font-normal text-dim"> · PQDI npc {b.npc}</span>
                  </div>
                  <div className="text-xs text-gold">{b.stats}</div>
                  <div className="mt-0.5 text-xs text-dim">{b.abilities}</div>
                  {b.before && <><H>Before this one</H><List items={b.before} /></>}
                  <H>Expect</H>
                  <List items={b.mechanics} />
                  {b.after && <><H>After</H><List items={b.after} /></>}
                  <H>Loot</H>
                  {(loot.drops.get(b.npc) ?? []).length === 0 ? (
                    <p className="text-xs text-dim">Drop table not loaded; see PQDI.</p>
                  ) : (
                    <ul className="space-y-0.5 text-xs">
                      {loot.drops.get(b.npc)!.map(d => (
                        <li key={d.item_id}>
                          <ItemHover card={loot.cards[d.item_id]} fallbackName={d.item_name}>
                            <a href={`https://www.pqdi.cc/item/${d.item_id}`} target="_blank" rel="noreferrer" className="text-blue hover:underline">{d.item_name}</a>
                          </ItemHover>
                          <span className="text-dim"> {pct(d.effective_chance)}</span>
                          {wish && (
                            <WishlistControls
                              compact itemId={d.item_id} itemName={d.item_name} enabled={wish.enabled}
                              characters={wish.characters} defaultCharacter={wish.defaultCharacter}
                              states={wish.states.get(d.item_id) ?? {}}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {b.history && <p className="mt-2 text-[11px] text-dim">{b.history}</p>}
                </div>
              ))}
            </div>
            <div>
              <ZoneSvg
                walls={walls}
                markers={s.markers}
                route={route}
                altRoutes={route.kind === 'planned' ? s.altRoutes : undefined}
                patrol={s.patrol}
                label={`Map of ${s.zoneName} with the route`}
              />
              <p className="mt-1 text-[11px] text-dim">
                <span className="text-red">●</span> boss · <span className="text-green">◆</span> zone-in or door · <span className="text-gold">▲</span> NPC ·{' '}
                {route.kind === 'walked'
                  ? <><span className="text-orange">——</span> numbered route, {route.note}</>
                  : <><span className="text-orange">- - -</span> numbered route, {route.note}: straight legs in order, not a walking path</>}
                {s.patrol && <> · <span className="text-purple">——</span> patrol</>}
                {walls ? '' : ' · walls unavailable for this zone right now'}
              </p>
              <ul className="mt-1 columns-2 text-[11px] text-dim">
                {s.markers.map((m, j) => (
                  <li key={`${m.label}${j}`} className="break-inside-avoid">
                    <span className={m.kind === 'boss' ? 'text-red' : m.kind === 'zonein' ? 'text-green' : 'text-gold'}>{markerLetter(j)}</span> {m.label}
                  </li>
                ))}
              </ul>
              <ol className="mt-1 list-decimal pl-5 text-[11px] text-dim">
                {route.stops.map((p, j) => <li key={j}>{p.label}</li>)}
              </ol>
              {route.kind === 'planned' && s.altRoutes?.map((rt, j) => (
                <ol key={j} className="mt-1 list-decimal pl-5 text-[11px] text-blue">
                  {rt.map((p, k) => <li key={k}>{p.label}</li>)}
                </ol>
              ))}
              <details className="mt-2 text-[11px] text-dim">
                <summary className="cursor-pointer hover:text-text">Where things stand (/loc)</summary>
                <ul className="mt-1 space-y-0.5">
                  {s.markers.map(m => <li key={m.label}>{m.label}: <span className="font-mono text-text">{loc(m.x, m.y)}</span></li>)}
                </ul>
              </details>
            </div>
          </div>
        </section>
  );
}
