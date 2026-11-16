// /design — the living style guide for the design-system preview (the guild lead, 2026-11-16: "start with base design,
// so everything can feel like one site"). New page, so it carries the [beta] tag. Members only: its table and list samples
// are the guild's live boss timers (lib/designSamples.ts), not made-up rows.
// Switch the look with the chip bottom-right on b.wolfpack.quest, or ?ds=a|b|c (?ds=off for today's).
// Everything below is built from web/components/ui and token classes; the swatches are the only place a value is named.
import type { Metadata } from 'next';
import NewPageTag from '@/components/NewPageTag';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Progress, { FILL_TEXT, fillOf } from '@/components/ui/Progress';
import TwoPane from './TwoPane';
import { type Tone } from '@/components/ui/Chip';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireMember } from '@/lib/member';
import { userTz } from '@/lib/timezone';
import { fmtAbs } from '@/lib/timezone-shared';
import { pickSamples, type TimerRow, type TimerSample } from '@/lib/designSamples';

export const metadata: Metadata = {
  title: '[beta] Design system',
  description: 'The Wolf Pack site’s shared look: colours with contrast ratios, type scale, page header, buttons, status chips, cards, tables and the list-and-detail layout.',
};

// [name, r, g, b, what it means]. The ratio is computed against the three grounds from these values.
const TOKENS: [string, number, number, number, string][] = [
  ['text',            201, 209, 217, 'body copy, titles in every preview'],
  ['text-2',          174, 183, 192, 'secondary copy (preview value)'],
  ['text-3',          139, 148, 158, 'muted: captions, labels (preview value)'],
  ['dim (preview)',   154, 164, 173, 'the lifted grey: text-dim in a preview'],
  ['dim (today)',     110, 118, 129, 'production grey: under AA on every ground'],
  ['blue',             88, 166, 255, 'links, primary action'],
  ['gold',            210, 153,  34, 'DKP, top, warning: meaning only'],
  ['green',            86, 211, 100, 'good, kill'],
  ['red',             248,  81,  73, 'bad, dead, HP'],
  ['orange',          255, 166,  87, 'warning'],
  ['purple',          163, 113, 247, 'rare, special'],
  ['bone',            242, 237, 225, 'selection text, hero headings'],
];
const GROUNDS: [string, number, number, number][] = [['bg', 13, 17, 23], ['panel', 22, 27, 34], ['raised', 33, 38, 45]];

const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: number[], b: number[]) => {
  const x = lum(a[0], a[1], a[2]), y = lum(b[0], b[1], b[2]);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

// The live samples: the real boss timers, as /boards reads them (lib/designSamples.ts picks which and words them).
async function loadTimers(): Promise<TimerRow[]> {
  try {
    const { data } = await supabaseAdmin().from('bot_boards')
      .select('boss_id, name, zone, timer_hours, killed_at, next_spawn').limit(400);
    return (data ?? []) as TimerRow[];
  } catch { return []; }
}

const COLS: Column<TimerSample>[] = [
  { key: 'boss', label: 'Boss', render: s => <span>{s.name}<span className="block text-xs text-text3">{s.zone}</span></span> },
  { key: 'respawn', label: 'Respawn', numeric: true, render: s => s.respawn },
  { key: 'when', label: 'Spawns', numeric: true, render: s => <span className={FILL_TEXT[fillOf(s.done, s.total)]}>{s.when}</span> },
  { key: 'bar', label: 'Timer run', render: s => <div className="min-w-[140px]"><Progress done={s.done} total={s.total} label={`${s.name} respawn timer`} /></div> },
];

const STATE: Record<TimerSample['state'], { tone: Tone; word: (s: TimerSample) => string }> = {
  up: { tone: 'success', word: () => 'Available' },
  soon: { tone: 'warning', word: s => `Spawns ${s.when}` },
  cooldown: { tone: 'neutral', word: s => `Back ${s.when}` },
};
const at = (iso: string | null, tz: string) => (iso ? fmtAbs(iso, tz) : '—');

const H2 = 'mb-3 text-base font-semibold text-text';

export const dynamic = 'force-dynamic';

export default async function DesignPage() {
  // Members only, like /boards: the samples are the guild's live timers.
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) redirect('/auth/signin?next=/design');
  await requireMember(user.id);
  const [rows, tz] = await Promise.all([loadTimers(), userTz()]);
  const samples = pickSamples(rows, Date.now());
  const pane = samples.map(s => ({
    id: s.id, name: s.name, status: STATE[s.state].word(s), tone: STATE[s.state].tone,
    note: s.state === 'up'
      ? `${s.zone ? s.zone + ' · ' : ''}${s.respawn} respawn timer · no timer running: available now.`
      : `${s.zone ? s.zone + ' · ' : ''}${s.respawn} respawn timer · killed ${at(s.killedAt, tz)} · back ${at(s.nextSpawn, tz)} (${s.when}).`,
  }));
  return (
    <div className="space-y-10">
      <NewPageTag note="The shared look, in one place. Switch it with the chip at the bottom right." />
      <PageHeader
        eyebrow="Design system"
        title="One site, one look"
        lede="Colour, type and the handful of parts every page is built from. Gold and orange mean something; titles are plain text."
        actions={<><Button variant="primary">Primary</Button><Button variant="ghost" sm>Reset</Button></>}
      />

      <section aria-labelledby="ds-colour">
        <h2 id="ds-colour" className={H2}>Colour tokens</h2>
        <p className="mb-3 max-w-prose text-sm text-text2">Contrast is WCAG 2.x against the three grounds; 4.5 or more passes AA for body text.</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max border-collapse text-sm tabular-nums">
            <thead><tr className="bg-raised text-xs text-text2">
              <th className="px-3 py-2 text-left font-medium">Token</th><th className="px-3 py-2 text-left font-medium">Value</th>
              {GROUNDS.map(g => <th key={g[0]} className="px-3 py-2 text-right font-medium">on {g[0]}</th>)}
              <th className="px-3 py-2 text-left font-medium">Used for</th>
            </tr></thead>
            <tbody>
              {TOKENS.map(([name, r, g, b, use]) => (
                <tr key={name} className="border-t border-border bg-panel">
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-2">
                    <span aria-hidden className="inline-block h-4 w-4 rounded border border-border" style={{ background: `rgb(${r} ${g} ${b})` }} />{name}</span></td>
                  <td className="px-3 py-2 text-text2">{hex(r, g, b)}</td>
                  {GROUNDS.map(gr => {
                    const v = ratio([r, g, b], [gr[1], gr[2], gr[3]]);
                    return <td key={gr[0]} className={`px-3 py-2 text-right ${v >= 4.5 ? 'text-text' : 'text-red'}`}>{v.toFixed(2)}{v >= 4.5 ? '' : ' fails'}</td>;
                  })}
                  <td className="px-3 py-2 text-text2">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="ds-type">
        <h2 id="ds-type" className={H2}>Type scale</h2>
        <Card as="div">
          <dl className="space-y-3">
            {([
              ['Page title · 22 / 26 px, weight 650', 'text-2xl text-title font-semibold', 'Raid night plan'],
              ['Section heading · 16 px, semibold', 'text-base font-semibold text-text', 'Who still needs the flag'],
              ['Body · 14 px', 'text-sm text-text', 'Wolf Pack raids Sunday, Wednesday and Thursday at 8:30 PM Eastern.'],
              ['Secondary · 14 px, text-2', 'text-sm text-text2', 'Updated from the last upload.'],
              ['Small · 12 px, text-3', 'text-xs text-text3', 'Parsed 4 minutes ago. Floor is 11 px, never smaller.'],
            ] as const).map(([label, cls, sample]) => (
              <div key={label} className="grid gap-1 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-4">
                <dt className="text-xs text-text3">{label}</dt>
                <dd className={cls}>{sample}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section aria-labelledby="ds-header">
        <h2 id="ds-header" className={H2}>Page header</h2>
        <Card as="div">
          <PageHeader eyebrow="Raid" title="Raid night plan" lede="Tonight’s targets in order, and who still needs a preflag." actions={<Button sm>Share</Button>} />
          <p className="text-xs text-text3">Eyebrow, one title, one line, actions on the right; actions wrap under the title on a phone.</p>
        </Card>
      </section>

      <section aria-labelledby="ds-buttons">
        <h2 id="ds-buttons" className={H2}>Buttons</h2>
        <Card as="div">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button><Button>Default</Button><Button variant="ghost">Ghost</Button>
            <Button variant="primary" sm>Primary sm</Button><Button sm>Default sm</Button><Button variant="ghost" sm>Ghost sm</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>
      </section>

      <section aria-labelledby="ds-chips">
        <h2 id="ds-chips" className={H2}>Status chips</h2>
        <Card as="div">
          <div className="flex flex-wrap gap-2">
            <Chip tone="success">Killed</Chip><Chip tone="warning">Window open</Chip><Chip tone="danger">Missed</Chip>
            <Chip tone="info">Scheduled</Chip><Chip tone="neutral">No data</Chip>
          </div>
        </Card>
      </section>

      <section aria-labelledby="ds-card">
        <h2 id="ds-card" className={H2}>Card</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Attendance" actions={<Chip tone="success">On track</Chip>}>
            <p className="text-sm text-text2">A panel ground, a hairline border, one heading style. Content sits on 16px padding.</p>
          </Card>
          <Card title="Open reports" actions={<Button sm variant="ghost">View</Button>}>
            <p className="text-sm text-text2">Actions live top right and collapse to icons only if they must.</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="ds-table">
        <h2 id="ds-table" className={H2}>Table, counts and progress</h2>
        <p className="mb-3 max-w-prose text-sm text-text2">The live boss timers: every timer running now, soonest first, then bosses still available in the same zones. The bar is how much of the respawn timer has run: gold while it runs (faint at the very start), green when the boss is available.</p>
        {samples.length
          ? <DataTable columns={COLS} rows={samples} rowKey={s => s.id} caption="Boss respawn timers" />
          : <p className="text-sm text-text3">No timers could be read right now.</p>}
      </section>

      <section aria-labelledby="ds-twopane">
        <h2 id="ds-twopane" className={H2}>List and detail</h2>
        {pane.length > 0 && <TwoPane items={pane} />}
      </section>
    </div>
  );
}
