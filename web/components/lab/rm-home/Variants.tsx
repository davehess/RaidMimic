// The three player-first drafts of the raidmimic.com landing (design lab, rm-home), composed from the page's own blocks
// (FeatureBlocks, RaidManagement, Pricing, CtaBand, Footer: reused, not copied) and the new pieces beside this file.
// Server components. page.tsx hands the three to RmHomeSwitch on a beta build; the default page does not use them.
import type { ReactNode } from 'react';
import type { CharacterView } from '@/lib/hubCharactersView';
import type { HomeGuild } from '@/lib/raidmimicHome';
import { CtaBand, Footer, type Ctx } from '@/app/raidmimic/_landing/Parts';
import { FeatureBlocks, Pricing, RaidManagement, SignUp } from '@/app/raidmimic/_landing/StoryParts';
import { MEDIA } from '@/lib/lab/fixtures/rm-first-screen';
import { PLAYER_HERO as P, TOOL } from '@/lib/lab/fixtures/rm-home';
import { H1, LEAD, Shot } from '@/components/lab/rm-first-screen/parts';
import Doors from './Doors';
import ToolBox from './ToolBox';
import VariantHostBar from './VariantBar';
import { DraftStrip, GOLD, LeaderDivider, PlayerGets, PlayerPanel, QUIET } from './parts';

export interface HomeVariantProps {
  ctx: Ctx; downloadUrl: string; demoHref: string; signedIn: boolean;
  /** Set only when signed in: what the default panel was given. */
  panel: { name: string | null; avatarUrl: string | null; mine: CharacterView[]; guilds: HomeGuild[] } | null;
}

const Page = ({ children }: { children: ReactNode }) => <div id="raidmimic-home" className="mx-auto max-w-5xl px-1 pb-12">{children}</div>;

/** Everything a guild leader reads, under one divider. */
function LeaderBlocks({ ctx }: { ctx: Ctx }) {
  return (
    <>
      <LeaderDivider />
      <RaidManagement />
      <Pricing setup={ctx.setup} onHost={ctx.onHost} />
      <div className="mt-12"><CtaBand ctx={ctx} /></div>
    </>
  );
}

function Kicker({ children }: { children: string }) {
  return <p className="m-0 text-xs uppercase tracking-wider text-dim">{children}</p>;
}

// ─── A: Player home ─────────────────────────────────────────────────────────────────────────────────
export function VariantA({ ctx, downloadUrl, demoHref, signedIn, panel }: HomeVariantProps) {
  return (
    <Page>
      <DraftStrip current="a" />
      <VariantHostBar kind="player" signedIn={signedIn} />
      {signedIn && panel ? (
        <PlayerPanel {...panel} downloadUrl={downloadUrl} />
      ) : (
        <>
          <section aria-label="Raid Mimic for players" className="grid items-center gap-8 pt-4 lg:grid-cols-2">
            <div>
              <Kicker>{P.kicker}</Kicker>
              <h1 className={`${H1} mt-2`}>{P.headline}</h1>
              <p className={LEAD}>{P.sentence}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <SignUp label={P.signIn} className={GOLD} />
                <a href={downloadUrl} className={QUIET}>{P.download}</a>
                <a href={demoHref} className="inline-flex min-h-11 items-center text-sm">{P.demo} →</a>
              </div>
              <p className="m-0 mt-3 text-xs text-dim">{P.fine}</p>
            </div>
            <Shot shot={MEDIA.dps} eager />
          </section>
          <PlayerGets />
          <FeatureBlocks />
        </>
      )}
      <LeaderBlocks ctx={ctx} />
      <Footer onHost={ctx.onHost} />
    </Page>
  );
}

// ─── B: Two doors ───────────────────────────────────────────────────────────────────────────────────
export function VariantB({ ctx, downloadUrl, demoHref, signedIn, panel }: HomeVariantProps) {
  return (
    <Page>
      <DraftStrip current="b" />
      <VariantHostBar kind="minimal" signedIn={signedIn} />
      <section aria-label="Raid Mimic" className="pt-2">
        <h1 className={`${H1} max-w-none`}>{signedIn && panel ? `Welcome back, ${panel.name ?? 'Player'}` : 'Raid Mimic'}</h1>
        <p className={LEAD}>Free, open-source overlays for your EverQuest raids. Pick the door that fits you.</p>
        <div className="mt-6">
          <Doors links={{ download: downloadUrl, demo: demoHref, register: ctx.interest, signedIn }}
            raid={<><PlayerGets /><FeatureBlocks /></>}
            lead={<><RaidManagement /><Pricing setup={ctx.setup} onHost={ctx.onHost} /><div className="mt-12"><CtaBand ctx={ctx} /></div></>} />
        </div>
      </section>
      <Footer onHost={ctx.onHost} />
    </Page>
  );
}

// ─── C: Tool first ──────────────────────────────────────────────────────────────────────────────────
export function VariantC({ ctx, downloadUrl, demoHref, signedIn, panel }: HomeVariantProps) {
  return (
    <Page>
      <DraftStrip current="c" />
      <VariantHostBar kind="player" signedIn={signedIn} />
      {signedIn && panel ? (
        <PlayerPanel {...panel} downloadUrl={downloadUrl} />
      ) : (
        <>
          <section aria-label="Check your PoP flags" className="grid items-start gap-8 pt-4 lg:grid-cols-2">
            <div>
              <Kicker>{TOOL.kicker}</Kicker>
              <h1 className={`${H1} mt-2`}>{TOOL.headline}</h1>
              <p className={LEAD}>{TOOL.sentence}</p>
              <p className="m-0 mt-3"><a href={demoHref} className="inline-flex min-h-11 items-center text-sm">{P.demo} →</a></p>
            </div>
            <ToolBox download={downloadUrl} />
          </section>
          <PlayerGets />
        </>
      )}
      <LeaderBlocks ctx={ctx} />
      <Footer onHost={ctx.onHost} />
    </Page>
  );
}
