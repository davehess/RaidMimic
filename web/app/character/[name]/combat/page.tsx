// /character/[name]/combat — a character's combat in detail: swings avoided, damage trends, per-ability hit
// sizes, Harm Touch and the monk weave.
//
// Visibility: every signed-in guild member sees any character's page (the guild lead, 2026-11-15, "every member"), like the
// parses. A character with exclude_from_stats is hidden from other members; its owner and officers still see it
// (combatAccess in lib/characterCombat.ts). The data is the `character_combat_trends` RPC, which filters by
// my_guild_ids() (auth.uid), so it is called with the signed-in member's own cookie client, never the admin one.

import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { supabaseServer } from '@/lib/supabase-server';
import { requireMember } from '@/lib/member';
import { isOfficer } from '@/lib/officer';
import { ownerOfCharacter } from '@/lib/namePronunciation';
import { characterMeta } from '@/lib/pageMeta';
import { GUILD_TAG } from '@/lib/guild';
import { fmtDmg, fmtDuration, cleanBossName } from '@/lib/format';
import {
  combatAccess, cleanFights, parseDays, aggregateNights, summarizeTaken, dpsSpread, abilityTable,
  abilityShareByNight, harmTouch, summarizeWeave, weaveByNight, type CombatFight,
} from '@/lib/characterCombat';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const { title, description } = characterMeta(name, 'combat');
  return { title, description };
}

const pct = (n: number | null | undefined, d = 1) => (n == null ? '—' : `${n.toFixed(d)}%`);
const fmtNum = (n: number | null | undefined) => (n == null ? '—' : fmtDmg(Math.round(n)));

function Beta() {
  return (
    <span className="ml-2 text-[10px] tracking-widest font-bold px-2 py-0.5 rounded bg-orange/20 border border-orange/60 text-orange uppercase align-middle">
      beta
    </span>
  );
}

function Card({ title, children, accent = 'text-blue' }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <section className="bg-panel border border-border rounded-lg p-4">
      <h3 className={`text-sm mb-3 ${accent}`}>{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="bg-bg border border-border rounded p-3">
      <div className="text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className="text-lg text-text font-mono">{value}</div>
      {sub && <div className="text-[11px] text-dim">{sub}</div>}
    </div>
  );
}

// A line over time with the points marked. Scales to its own min..max (0 floor when `zero`).
function Spark({ values, labels, zero = true, color = 'text-blue' }: { values: number[]; labels: string[]; zero?: boolean; color?: string }) {
  if (values.length === 0) return null;
  const W = 300, H = 60, P = 4;
  const lo = zero ? 0 : Math.min(...values);
  const hi = Math.max(...values, lo + 1e-9);
  const x = (i: number) => (values.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (values.length - 1));
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full h-16 ${color}`} role="img" aria-label={`Trend over ${values.length} nights`}>
      {values.length > 1 && <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="currentColor"><title>{`${labels[i]}: ${v.toFixed(1)}`}</title></circle>
      ))}
    </svg>
  );
}

// Stacked share-of-damage bars, one per night, ability colours by position (token classes, no hex).
const SHARE_FILL = ['fill-blue', 'fill-gold', 'fill-green', 'fill-purple', 'fill-orange', 'fill-dim'];
function ShareBars({ keys, nights }: { keys: string[]; nights: { night: string; share: Record<string, number> }[] }) {
  if (nights.length === 0) return null;
  const W = 300, H = 60, gap = 2;
  const bw = Math.max(3, (W - gap * (nights.length - 1)) / nights.length);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img" aria-label="Share of damage by ability per night">
        {nights.map((n, i) => {
          let yy = H;
          return (
            <g key={n.night}>
              {keys.map((k, ki) => {
                const h = (n.share[k] / 100) * H;
                yy -= h;
                return h > 0 ? <rect key={k} x={i * (bw + gap)} y={yy} width={bw} height={h} className={SHARE_FILL[ki % SHARE_FILL.length]}><title>{`${n.night} ${k}: ${n.share[k].toFixed(0)}%`}</title></rect> : null;
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-dim">
        {keys.map((k, ki) => (
          <span key={k}><span className={`inline-block w-2 h-2 mr-1 rounded-sm align-middle ${SHARE_FILL[ki % SHARE_FILL.length].replace('fill-', 'bg-')}`} />{k}</span>
        ))}
      </div>
    </div>
  );
}

function Range({ name, days }: { name: string; days: number }) {
  return (
    <div className="flex gap-2 text-xs">
      {[30, 90].map(d => (
        <Link key={d} href={`/character/${encodeURIComponent(name)}/combat?days=${d}`}
          className={`px-2 py-1 rounded border ${d === days ? 'border-gold text-gold' : 'border-border text-dim hover:text-text'}`}>
          {d} days
        </Link>
      ))}
    </div>
  );
}

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="text-sm"><Link href={`/character/${encodeURIComponent(name)}`} className="text-blue hover:underline">← back to {name}</Link></div>
      {children}
    </div>
  );
}

export default async function CharacterCombatPage({
  params, searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const { name } = await params;
  const sp = await searchParams;
  const decoded = decodeURIComponent(name);
  if (!/^[A-Za-z]{2,}$/.test(decoded)) notFound();

  const sbUser = supabaseServer();
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/character/${encodeURIComponent(name)}/combat`);
  await requireMember(user.id);

  const owner = await ownerOfCharacter(user.id, decoded).catch(() => ({ ok: false as const, error: 'lookup failed' }));
  const display = owner.ok ? owner.displayName : decoded;
  const days = parseDays(sp.days);

  const { data: charRow } = await supabaseAdmin().from('characters').select('class, exclude_from_stats').eq('guild_id', GUILD_TAG).ilike('name', display).maybeSingle();
  const access = combatAccess({ isOwner: owner.ok, isOfficer: await isOfficer(user.id), excluded: !!charRow?.exclude_from_stats });
  if (access !== 'show') {
    return (
      <Shell name={decoded}>
        <section className="bg-panel border border-border rounded-lg p-6">
          <h2 className="text-xl text-gold">🔒 Private<Beta /></h2>
          <p className="text-sm text-dim mt-2">{access === 'hidden' ? `${decoded}'s player keeps this page to themselves.` : `Only ${decoded}'s player can see this page for now.`}</p>
        </section>
      </Shell>
    );
  }

  const isMonk = /monk/i.test(String(charRow?.class ?? ''));

  // The member's own client: the RPC reads auth.uid() through my_guild_ids().
  const { data: raw, error } = await sbUser.rpc('character_combat_trends', { p_name: display, p_days: days });
  const fights: CombatFight[] = cleanFights(raw);

  const header = (
    <section className="bg-panel border border-border rounded-lg p-4 flex items-baseline justify-between flex-wrap gap-2">
      <h2 className="text-xl text-gold">{display} · Combat<Beta /></h2>
      <Range name={display} days={days} />
    </section>
  );

  if (error || fights.length === 0) {
    return (
      <Shell name={display}>
        {header}
        <section className="bg-panel border border-border rounded-lg p-4 text-sm text-dim">
          {error ? 'Combat details could not be loaded right now.' : `No fights from ${display} in the last ${days} days.`}
        </section>
      </Shell>
    );
  }

  const nights = aggregateNights(fights);
  const spread = dpsSpread(fights);
  const taken = summarizeTaken(fights);
  const takenNights = nights.filter(n => n.taken);
  const last = [...fights].reverse().find(f => f.taken) ?? null;
  const lastTaken = last ? summarizeTaken([last]) : null;
  const abilities = abilityTable(fights);
  const anyHist = abilities.some(a => a.hasHist);
  const shares = abilityShareByNight(fights);
  const ht = harmTouch(fights);
  const weave = summarizeWeave(fights);
  const showWeave = isMonk || !!weave;
  const wNights = weaveByNight(fights);
  const nightLabels = nights.map(n => n.night);

  return (
    <Shell name={display}>
      {header}

      <Card title="🛡️ Avoidance" accent="text-green">
        {taken.fights === 0 ? (
          <p className="text-sm text-dim">No fights where {display} uploaded their own log, so there is nothing taken to show.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Swings avoided" value={pct(taken.pct)} sub={`${taken.avoided.toLocaleString()} of ${taken.swings.toLocaleString()}`} />
              <Stat label="Taken per fight" value={fmtNum(taken.damagePerFight)} sub={`${taken.fights} fights`} />
              <Stat label="Taken per minute" value={fmtNum(taken.damagePerMin)} />
              <Stat label="Rampage share" value={pct(taken.rampageSharePct)} sub="of damage taken" />
            </div>
            <div className="mt-3 text-xs text-dim">
              Split: {(['misses', 'dodges', 'parries', 'ripostes', 'blocks'] as const).map(k => `${k} ${taken.split[k].toLocaleString()}`).join(' · ')}
            </div>
            {lastTaken && last && (
              <div className="mt-2 text-xs text-dim">
                Last fight ({cleanBossName(last.boss)}): {pct(lastTaken.pct)} avoided, {fmtNum(lastTaken.damageTaken)} taken.
              </div>
            )}
            {takenNights.length > 1 && (
              <div className="mt-3">
                <div className="text-[11px] text-dim">Swings avoided per raid night (%)</div>
                <Spark values={takenNights.map(n => n.taken!.pct ?? 0)} labels={takenNights.map(n => n.night)} color="text-green" />
                <div className="text-[11px] text-dim mt-2">Damage taken per minute, per raid night</div>
                <Spark values={takenNights.map(n => n.taken!.damagePerMin ?? 0)} labels={takenNights.map(n => n.night)} color="text-red" />
              </div>
            )}
          </>
        )}
        <p className="mt-3 text-[11px] text-dim">EverQuest does not log damage before mitigation, so this is swings avoided, not damage mitigated.</p>
      </Card>

      <Card title="📈 Damage trends" accent="text-orange">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Best fight" value={spread.best ? `${fmtNum(spread.best.dps)} dps` : '—'} sub={spread.best ? cleanBossName(spread.best.boss) : null} />
          <Stat label="Typical fight" value={`${fmtNum(spread.typical)} dps`} sub="median" />
          <Stat label="Worst fight" value={spread.worst ? `${fmtNum(spread.worst.dps)} dps` : '—'} sub={spread.worst ? cleanBossName(spread.worst.boss) : null} />
          <Stat label="Fights" value={String(fights.length)} sub={`${nights.length} raid nights`} />
        </div>
        {nights.length > 1 && (
          <div className="mt-3 space-y-2">
            <div>
              <div className="text-[11px] text-dim">DPS per raid night (damage ÷ fight time)</div>
              <Spark values={nights.map(n => n.dps)} labels={nightLabels} color="text-orange" />
            </div>
            <div>
              <div className="text-[11px] text-dim">Total damage per raid night</div>
              <Spark values={nights.map(n => n.totalDamage)} labels={nightLabels} color="text-gold" />
            </div>
            <div>
              <div className="text-[11px] text-dim">Share of damage by ability, per raid night</div>
              <ShareBars keys={shares.keys} nights={shares.nights} />
            </div>
          </div>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-dim text-left"><tr className="border-b border-border">
              <th className="py-1 pr-2">Night</th><th className="py-1 pr-2 text-right">Fights</th>
              <th className="py-1 pr-2 text-right">Damage</th><th className="py-1 pr-2 text-right">DPS</th>
              <th className="py-1 pr-2 text-right">Time</th>
            </tr></thead>
            <tbody>
              {[...nights].reverse().map(n => (
                <tr key={n.night} className="border-b border-border/40">
                  <td className="py-1 pr-2">{n.night}</td>
                  <td className="py-1 pr-2 text-right">{n.fights}</td>
                  <td className="py-1 pr-2 text-right">{fmtDmg(n.totalDamage)}</td>
                  <td className="py-1 pr-2 text-right">{fmtNum(n.dps)}</td>
                  <td className="py-1 pr-2 text-right">{fmtDuration(Math.round(n.seconds))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="⚔️ Per ability" accent="text-gold">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-dim text-left"><tr className="border-b border-border">
              <th className="py-1 pr-2">Ability</th><th className="py-1 pr-2 text-right">Hits</th>
              <th className="py-1 pr-2 text-right">Damage</th><th className="py-1 pr-2 text-right">Share</th>
              <th className="py-1 pr-2 text-right">Mean</th>
              {anyHist && <><th className="py-1 pr-2 text-right">High</th><th className="py-1 pr-2 text-right">Mid</th><th className="py-1 pr-2 text-right">Low</th></>}
            </tr></thead>
            <tbody>
              {abilities.map(a => (
                <tr key={a.key} className="border-b border-border/40">
                  <td className="py-1 pr-2">{a.name}{a.damageShield && <span className="text-dim"> (damage shield)</span>}</td>
                  <td className="py-1 pr-2 text-right">{a.hits.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right">{fmtDmg(a.dmg)}</td>
                  <td className="py-1 pr-2 text-right">{pct(a.sharePct, 0)}</td>
                  <td className="py-1 pr-2 text-right">{fmtNum(a.mean)}</td>
                  {anyHist && <>
                    <td className="py-1 pr-2 text-right">{fmtNum(a.max)}</td>
                    <td className="py-1 pr-2 text-right">{fmtNum(a.median)}</td>
                    <td className="py-1 pr-2 text-right">{fmtNum(a.min)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!anyHist && <p className="mt-3 text-[11px] text-dim">Highs and lows arrive with Mimic 3.1. Until then this shows the mean hit only.</p>}
      </Card>

      {ht && (
        <Card title="✋ Harm Touch" accent="text-purple">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Uses" value={ht.count.toLocaleString()} sub={`in ${ht.fights} fights`} />
            <Stat label="Total damage" value={fmtDmg(ht.total)} />
            <Stat label="Mean" value={fmtNum(ht.count ? ht.total / ht.count : 0)} />
          </div>
        </Card>
      )}

      {showWeave && (
        <Card title="🥋 Monk weave" accent="text-blue">
          {!weave ? (
            <p className="text-sm text-dim">No weave data yet. It arrives with a later Mimic version.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Rounds with a special" value={pct(weave.specialRoundPct)} sub={`${weave.rounds.toLocaleString()} rounds`} />
                <Stat label="Late after a special" value={pct(weave.lateRoundPct)} sub="clips" />
                <Stat label="Specials per minute" value={weave.specialsPerMin == null ? '—' : weave.specialsPerMin.toFixed(1)} />
                <Stat label="Round gap" value={weave.avgRoundGapMs == null ? '—' : `${Math.round(weave.avgRoundGapMs)} ms`} />
              </div>
              {wNights.length > 1 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] text-dim">Rounds with a special per raid night (%)</div>
                  <Spark values={wNights.map(n => n.weave.specialRoundPct ?? 0)} labels={wNights.map(n => n.night)} color="text-blue" />
                  <div className="text-[11px] text-dim">Late rounds after a special per raid night (%)</div>
                  <Spark values={wNights.map(n => n.weave.lateRoundPct ?? 0)} labels={wNights.map(n => n.night)} color="text-red" />
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </Shell>
  );
}
