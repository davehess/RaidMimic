// /costs: "What Raid Mimic costs to run" on raidmimic.com (the guild lead, 2026-11-15, DECISIONS §588: live party merging is
// free and donation-funded, hosted replays are what we will charge for, "the rest we can eat up front and show the cost of
// it on the site"). Public, no sign-in, no database read: every figure comes from web/lib/runningCosts.ts.
//
// New page, so it goes live with the [beta] tag. Server-rendered, no client script.
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { isRaidmimicHost } from '@/lib/raidmimicHost';
import HostFrame from '@/components/RaidmimicFrame';
import { bill, donationLine, knownMonthly, KOFI_URL, measuredAt, recapSize, replayParts, replaySize } from '@/lib/runningCosts';

const TITLE = 'What Raid Mimic costs to run';
const DESCRIPTION = 'What it costs to run Raid Mimic each month, what is free and why, what we will charge for (hosted replays and a Discord bot), and how to chip in on Ko-fi.';

export function generateMetadata(): Metadata {
  const onHost = isRaidmimicHost(headers().get('host'));
  return {
    title: onHost ? { absolute: `${TITLE} · Raid Mimic` } : TITLE,
    description: DESCRIPTION,
  };
}

const CARD = 'rounded-lg border border-border bg-panel p-4';
const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 text-sm text-gold hover:no-underline focus-visible:ring-2 focus-visible:ring-blue';

export default function CostsPage() {
  const onHost = isRaidmimicHost(headers().get('host'));
  return (
    <HostFrame onHost={onHost}>
      <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
        <p className="m-0 text-xs uppercase tracking-widest text-orange">[beta]</p>
        <h1 className="text-2xl text-gold">{TITLE}</h1>
        <p className="mt-1 text-sm text-dim">Figures measured {measuredAt}. We would rather show you the bill than ask you to trust us.</p>

        <section aria-label="What is free" className="mt-5">
          <h2 className="text-lg text-text">What is free, and why</h2>
          <div className={`${CARD} mt-2 space-y-2 text-sm text-text`}>
            <p className="m-0"><span className="text-gold">Live party merging.</span> Your group&rsquo;s overlay numbers are merged for everyone while you play. It lives in memory for 10 minutes and stores nothing, so it costs almost nothing to keep running. It is free, and paid for by donations.</p>
            <p className="m-0"><span className="text-gold">Your PoP flags, your characters and My raids.</span> Small rows in the database. Free.</p>
            <p className="m-0"><span className="text-gold">Recaps.</span> The summary of a raid night: positions per minute, drops, rolls, attendance and per-ability totals. About {recapSize.mb} MB per guild per week. We are eating that for now.</p>
            <p className="m-0"><span className="text-gold">Overlays on your own PC.</span> They run on your computer from your own log, so they cost us nothing.</p>
          </div>
        </section>

        <section aria-label="What we will charge for" className="mt-6">
          <h2 className="text-lg text-text">What we will charge for, and why</h2>
          <div className={`${CARD} mt-2 text-sm text-text`}>
            <p className="m-0"><span className="text-gold">Hosted replays.</span> A replay is the fight second by second, and keeping it for you is the one thing that costs real money: about {replaySize.mb} MB per guild per week, more than ten times a recap. Without hosting, a replay still lives on your own Mimic, free.</p>
            <ul className="mb-0 mt-3 list-none space-y-1 p-0">
              {replayParts.map((p) => (
                <li key={p.key} className="flex justify-between gap-3 border-t border-border pt-1">
                  <span>{p.label}</span><span className="shrink-0 text-dim">{p.mb} MB</span>
                </li>
              ))}
            </ul>
            <p className="mb-0 mt-3"><span className="text-gold">A Raid Mimic bot in your guild&apos;s Discord.</span> Timers, raid cards and the rest in your own server: a bot connected all the time costs us server time every month.</p>
            <p className="mb-0 mt-3 text-xs text-dim">The price and how it is taken are not decided yet. Until then, nothing is charged.</p>
          </div>
        </section>

        <section aria-label="The monthly bill" className="mt-6">
          <h2 className="text-lg text-text">The monthly bill</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-widest text-dim">
                  <th scope="col" className="py-2 pr-3 font-normal">Service</th>
                  <th scope="col" className="py-2 font-normal">A month</th>
                </tr>
              </thead>
              <tbody>
                {bill.map((l) => (
                  <tr key={l.key} className="border-b border-border align-top">
                    <th scope="row" className="py-2 pr-3 font-normal text-text">{l.name}<span className="block text-xs text-dim">{l.what}</span></th>
                    <td className={`py-2 ${l.monthly === null ? 'text-dim' : 'text-text'}`}>{l.monthly === null ? 'not yet measured' : l.display}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-2 pr-3 font-normal text-gold">Added up</th>
                  <td className="py-2 text-gold">at least ${knownMonthly} a month</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs leading-5 text-dim">
            Measured {measuredAt}, from our own bills. It leaves out the party service&rsquo;s own usage, which nobody has measured yet. The database plan is shared with another small project, so part of it is not strictly Raid Mimic&rsquo;s. It also leaves out the biggest cost, the evenings it takes to build and run this, which are unpaid and not priced here.
          </p>
        </section>

        <section aria-label="Chip in" className="mt-6">
          <h2 className="text-lg text-text">Chip in</h2>
          <div className={`${CARD} mt-2`}>
            <p className="m-0 text-sm leading-6 text-text">{donationLine.text}</p>
            <p className="mb-0 mt-3"><a href={KOFI_URL} target="_blank" rel="noopener" className={BTN}>Chip in on Ko-fi</a></p>
          </div>
        </section>
      </div>
    </HostFrame>
  );
}
