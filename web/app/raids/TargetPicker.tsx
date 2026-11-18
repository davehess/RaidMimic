'use client';

// "Tonight's raid" on /raids: pick zones and/or bosses, newest expansion first (PoP open), ONE Save per night. A whole-zone box
// and a box per boss under it; the PoP gate targets sit at the top of PoP. Saves in place through a server action that returns a
// result (no redirect), like CharacterGuilds. A refusal puts the last saved picks back and says why.
import { useState, useTransition } from 'react';
import { saveRaidTargets } from './actions';
import { RAID_CATALOG, GATE_TARGETS, zoneKey, bossKey, MAX_TARGET_KEYS, parseTargetKeys } from '@/lib/raidTargets';

const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 text-sm text-gold hover:no-underline focus-visible:ring-2 focus-visible:ring-blue disabled:text-dim';
const ROW = 'flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text';
const BOX = 'h-5 w-5 shrink-0 accent-gold';

export default function TargetPicker({ entryId, date, initial }: { entryId: string; date: string; initial: string | null }) {
  const start = parseTargetKeys(initial) ?? [];
  const [saved, setSaved] = useState<string[]>(start);
  const [picked, setPicked] = useState<string[]>(start);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, run] = useTransition();
  const has = (k: string) => picked.includes(k);
  const changed = picked.length !== saved.length || picked.some(k => !saved.includes(k));

  function toggle(k: string) {
    setMsg(null);
    setPicked(p => p.includes(k) ? p.filter(x => x !== k) : p.length >= MAX_TARGET_KEYS ? p : [...p, k]);
  }

  function save() {
    const before = saved;
    setSaved(picked);
    setMsg(null);
    run(async () => {
      const r = await saveRaidTargets(entryId, date, picked);
      if (r.ok) setMsg({ ok: true, text: 'Saved.' });
      else { setSaved(before); setMsg({ ok: false, text: r.error }); }
    });
  }

  return (
    <div>
      {RAID_CATALOG.map((e, i) => {
        const n = e.zones.reduce((s, z) => s + (has(zoneKey(z)) ? 1 : 0) + z.bosses.filter(b => has(bossKey(b))).length, 0)
          + (i === 0 ? GATE_TARGETS.filter(t => has(t.key)).length : 0);
        return (
          <details key={e.key} open={i === 0} className="border-t border-border">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm text-text">
              <span>{e.label}</span>{n > 0 && <span className="text-xs text-gold">{n} picked</span>}
            </summary>
            <div className="pb-2 pl-1">
              {i === 0 && (
                <fieldset className="m-0 mb-2 border-0 p-0">
                  <legend className="text-xs text-dim">Flag targets</legend>
                  {GATE_TARGETS.map(t => (
                    <label key={t.key} className={ROW}><input type="checkbox" className={BOX} checked={has(t.key)} onChange={() => toggle(t.key)} />{t.label}</label>
                  ))}
                </fieldset>
              )}
              {e.zones.map(z => (
                <fieldset key={z.slug} className="m-0 mb-2 border-0 p-0">
                  <label className={`${ROW} text-gold`}>
                    <input type="checkbox" className={BOX} checked={has(zoneKey(z))} onChange={() => toggle(zoneKey(z))} />{z.name} <span className="text-xs text-dim">whole zone</span>
                  </label>
                  <div className="pl-8">
                    {z.bosses.map(b => (
                      <label key={b.id} className={ROW}><input type="checkbox" className={BOX} checked={has(bossKey(b))} onChange={() => toggle(bossKey(b))} />{b.name}</label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </details>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button type="button" className={BTN} disabled={pending || !changed} onClick={save}>
          {pending ? 'Saving…' : picked.length ? `Save ${picked.length} pick${picked.length === 1 ? '' : 's'}` : 'Save (no target)'}
        </button>
        <span role="status" className={`text-sm ${msg && !msg.ok ? 'text-red' : 'text-green'}`}>{msg?.text}</span>
        {picked.length >= MAX_TARGET_KEYS && <span className="text-xs text-dim">Up to {MAX_TARGET_KEYS} picks a night.</span>}
      </div>
    </div>
  );
}
