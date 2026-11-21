'use client';
// "Raid stats (officers)": one row per raider the recording tracked, sortable. Rendered only when the members' page
// hands it data, and the page builds that data only for an officer (lib/raidOfficerStats.ts officerStatsFor).
// Names arrive already labelled for opted-out raiders. The far-off marker is neutral: a count and a length.
import { useState } from 'react';
import {
  FAR_EPISODE_MIN_MS, FAR_EPISODES, FAR_MINUTES, FAR_SIGMA, MASS_DEATHS, RAID_STILL_SHARE, STILL_UNITS, fmtMs,
  type OfficerStats, type OfficerStatsRow,
} from '@/lib/raidOfficerStats';

type Key = 'name' | 'deaths' | 'stillMs' | 'stillShare' | 'avgDist' | 'outMs' | 'farEpisodes';
const COLS: { key: Key; label: string; num: boolean }[] = [
  { key: 'name', label: 'Raider', num: false },
  { key: 'deaths', label: 'Deaths', num: true },
  { key: 'stillMs', label: 'Longest still', num: true },
  { key: 'stillShare', label: '% still', num: true },
  { key: 'avgDist', label: 'Avg distance', num: true },
  { key: 'outMs', label: 'Out of raid zone', num: true },
  { key: 'farEpisodes', label: 'Far-off', num: true },
];

const val = (r: OfficerStatsRow, k: Key): string | number => (k === 'avgDist' ? r.avgDist ?? -1 : r[k]);

export default function OfficerStatsCard({ stats }: { stats: OfficerStats }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: 'stillShare', dir: -1 });
  if (!stats.rows.length) return null;
  const rows = stats.rows.slice().sort((a, b) => {
    const x = val(a, sort.key), y = val(b, sort.key);
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number);
    return c * sort.dir || a.name.localeCompare(b.name);
  });
  const click = (key: Key) => setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }));
  return (
    <section className="mt-3 rounded-md border border-border bg-panel p-3" aria-label="Raid stats (officers)">
      <h2 className="mb-2 text-sm text-gold">Raid stats (officers)</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-dim">
              {COLS.map(c => (
                <th key={c.key} className={`px-2 py-1 font-normal ${c.num ? 'text-right' : ''}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => click(c.key)} className="uppercase tracking-wider hover:text-text">
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-t border-border">
                <td className="max-w-[12rem] truncate px-2 py-1">{r.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.deaths}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMs(r.stillMs)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{Math.round(r.stillShare * 100)}%</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.avgDist == null ? '-' : Math.round(r.avgDist)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.outMs ? fmtMs(r.outMs) : '-'}</td>
                <td className="px-2 py-1 text-right tabular-nums">{r.farEpisodes ? `${r.far ? 'far ' : ''}×${r.farEpisodes}, longest ${fmtMs(r.farLongestMs)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-dim">
        Still: moved under {STILL_UNITS} units between frames. Distance: from the raid centre (median position) in the raid&apos;s zone, map units.
        Far-off: above the raid&apos;s mean + {FAR_SIGMA} SD, left out during mass deaths ({MASS_DEATHS}+ in a minute, ±1 min) and when {Math.round(RAID_STILL_SHARE * 100)}% of the raid stood still; an episode counts from {FAR_EPISODE_MIN_MS / 1000} s; marked at {FAR_EPISODES}+ episodes or one of {FAR_MINUTES}+ min.
      </p>
      <p className="mt-1 text-[11px] text-dim">
        Positions come from Zeal via raiders running Mimic: a raider is tracked when a Mimic user in their zone reports the raid, frames about 3 s apart. Not tracked is not the same as still.
      </p>
    </section>
  );
}
