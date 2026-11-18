'use client';

// "My characters' guilds" on /raids: every character's guild in one list with ONE Save (the guild lead, 2026-11-17: "saving each
// character individually refreshed the page"). Saves in place through a server action that returns a result (no redirect), so the
// page, the open sections and the scroll position stay put. Optimistic: the row shows what was picked at once; a refusal puts the
// last saved values back and says why.
import { useState, useTransition } from 'react';
import { setCharacterGuilds } from './actions';

type Guild = { id: string; name: string };
type Row = { name: string; guildId: string };

const FIELD = 'min-h-11 rounded border border-border bg-bg px-2 text-sm text-text focus-visible:ring-2 focus-visible:ring-blue';
const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 text-sm text-gold hover:no-underline focus-visible:ring-2 focus-visible:ring-blue disabled:text-dim';

export default function CharacterGuilds({ guilds, rows }: { guilds: Guild[]; rows: Row[] }) {
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(rows.map(r => [r.name, r.guildId])));
  const [picked, setPicked] = useState<Record<string, string>>(saved);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = rows.filter(r => picked[r.name] !== saved[r.name]);

  function save() {
    const send = changed.map(r => ({ name: r.name, id: picked[r.name] }));
    const before = saved;
    setSaved({ ...saved, ...Object.fromEntries(send.map(s => [s.name, s.id])) });
    setMsg(null);
    start(async () => {
      const r = await setCharacterGuilds(send);
      if (r.ok) setMsg({ ok: true, text: 'Saved.' });
      else { setSaved(before); setMsg({ ok: false, text: r.error }); }
    });
  }

  return (
    <div>
      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {rows.map(r => (
          <li key={r.name} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`cg-${r.name}`} className="min-w-28 text-sm text-text">{r.name}</label>
            <select id={`cg-${r.name}`} value={picked[r.name]} className={FIELD}
              onChange={e => { setPicked({ ...picked, [r.name]: e.target.value }); setMsg(null); }}>
              {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={BTN} disabled={pending || changed.length === 0} onClick={save}>
          {pending ? 'Saving…' : changed.length > 1 ? `Save ${changed.length} changes` : 'Save'}
        </button>
        <span role="status" className={`text-sm ${msg && !msg.ok ? 'text-red' : 'text-green'}`}>{msg?.text}</span>
      </div>
    </div>
  );
}
