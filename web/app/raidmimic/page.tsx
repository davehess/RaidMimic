// raidmimic.com: the player-first front door. Served at the root of raidmimic.com / .net / .quest (middleware.ts rewrites there) and
// also at wolfpack.quest/raidmimic and b.wolfpack.quest/raidmimic. Public; signing in only swaps the first screen for the player's
// own Dashboard.
//
// ONE page, assembled from the guild lead's picks of 2026-11-15/16 (Decision Desk cards rm-home, rm-home-story, lab-rm-first-screen,
// about-page-placement and raidmimic-layout-clips), player first and short ("a title, one line, then the content"):
//   signed out  first screen (headline, one line, Download + "See the guild demo", the mascot loop muted beside them)
//               -> Pick your path (Player, Guild, Self-host)
//   signed in   the Dashboard: your raids, your characters, Mimic
//   both        See it run (the clips, one beat of a raid night each) -> what you get (the CH chain is on this side) -> [signed out:
//               PoP flags] -> How it works (the drawing) -> "Running a guild?" divider -> raid management, pricing, the ask.
// The 81 second intro video is no longer here: it plays only on the For guild leaders page (/register). Words are in
// web/lib/raidmimicPlayer.ts, web/lib/raidmimicLanding.ts and web/lib/raidmimicStory.ts; "coming" means coming, and the page
// never says otherwise. The earlier story stage, "Pick your path", sign-in-first, Chapters and `?v=` previews are gone.
//
// Search engines (2026-10-23): INDEXED on the raidmimic hosts only, with https://raidmimic.com/ as the canonical address;
// the same page on wolfpack.quest and b.wolfpack.quest is noindex. web/lib/raidmimicHost.ts raidmimicSeo() decides, per
// request, from the Host header. The Register-interest button opens the anonymous form on eqmimic.quest (there is no
// form or mailbox of ours), so that form's rules apply: its text is untrusted data that people review, nothing acts on
// it automatically (CLAUDE.md, AFB).
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase-server';
import { discordIdOf } from '@/lib/lockout';
import { loadMine } from '@/lib/hubMine';
import HomeDashboard from './_landing/HomeDashboard';
import { loadHomeGuilds } from '@/lib/hubGuildsLoad';
import { profileOf } from '@/lib/hubRegistry';
import type { Metadata } from 'next';
import { isRaidmimicHost, raidmimicSeo, RAIDMIMIC_CHARACTERS_PATH, RAIDMIMIC_DEMO_PATH, RAIDMIMIC_SETUP_PATH } from '@/lib/raidmimicHost';
import { EQMIMIC_FEEDBACK_PATH, EQMIMIC_ORIGIN, interestUrl } from '@/lib/raidmimicLanding';
import { DOWNLOAD_URL } from '@/lib/raidmimicPlayer';
import { CtaBand, Footer, type Ctx } from './_landing/Parts';
import { Doors, FirstScreen, GuildDivider, HowSection, SeeItRun } from './_landing/Sections';
import { FeatureBlocks, Pricing, RaidManagement } from './_landing/StoryParts';
import HostFrame from '@/components/RaidmimicFrame';

const TITLE = 'Raid Mimic · free EverQuest raid overlays';
const DESCRIPTION =
  'Free, open-source overlays for your EverQuest raids, built from the log the game already writes: run it on your own, or add a guild hub for shared raid reviews, merged parses and a command center.';

export function generateMetadata(): Metadata {
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    ...raidmimicSeo(headers().get('host'), '/'),
    openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Raid Mimic', type: 'website' },
    twitter: { card: 'summary' },
  };
}

export default async function RaidmimicPage() {
  // On a raidmimic host the form lives on eqmimic.quest and the page is `/`. On the Wolf Pack hosts the form is
  // reached by its real path, so the site header stays above the page.
  const onHost = isRaidmimicHost(headers().get('host'));
  const ctx: Ctx = onHost
    ? { onHost, interest: interestUrl(`${EQMIMIC_ORIGIN}/feedback`), setup: '/setup', demo: '/demo/raid' }
    : { onHost, interest: interestUrl(EQMIMIC_FEEDBACK_PATH), setup: RAIDMIMIC_SETUP_PATH, demo: `${RAIDMIMIC_DEMO_PATH}/raid` };
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);
  const signedIn = !!(user && discordId);
  let top = <FirstScreen ctx={ctx} />;
  if (signedIn) {
    // The Dashboard (the guild lead picked option B, 2026-11-09): who you are, your characters, your guilds, Mimic.
    const [mine, guilds] = await Promise.all([loadMine(discordId!), loadHomeGuilds(discordId!)]);
    const { displayName, avatarUrl } = profileOf(user!);
    top = <HomeDashboard name={displayName} avatarUrl={avatarUrl} mine={mine} guilds={guilds} downloadUrl={DOWNLOAD_URL} />;
  }
  // On a raidmimic host the page sits in the shell (Wolf Pack's header and footer around it, the guild lead, 2026-11-15), so
  // the bar the page used to draw and its own Footer are the shell's now. No query is read: a raidmimic host drops every one in
  // the middleware, and the Wolf Pack hosts show the same page.
  return (
    <HostFrame onHost={onHost}>
    <div id="raidmimic-home" className="mx-auto max-w-5xl pb-12">
      {top}
      {!signedIn && <Doors ctx={ctx} />}
      <SeeItRun />
      <FeatureBlocks />
      {!signedIn && (
        <section aria-label="Track your PoP flags" className="mt-12 rounded-md border border-gold/70 bg-panel p-5 sm:p-6">
          <h2 className="text-xl text-text">Track your PoP flags</h2>
          <p className="mb-0 mt-2 max-w-[62ch] text-sm leading-6 text-text">
            Sign in with Discord, then paste your #popflags lines or drop the PoPFlags file. Only you see it.
          </p>
          <p className="mb-0 mt-4"><a href={RAIDMIMIC_CHARACTERS_PATH} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-bg px-4 text-sm text-gold hover:no-underline">Track your PoP flags</a></p>
        </section>
      )}
      <HowSection />
      <GuildDivider />
      <RaidManagement />
      <Pricing setup={ctx.setup} onHost={onHost} />
      <div className="mt-12"><CtaBand ctx={ctx} /></div>
      {!onHost && <Footer onHost={false} />}
    </div>
    </HostFrame>
  );
}
