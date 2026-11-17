// raidmimic.com/register: the interest form for a guild leader (the guild lead, 2026-11-01, option B: "a proper interest
// form, no sign-in"). Served at raidmimic.com/register (the middleware rewrites /register here) and, for preview, at
// wolfpack.quest/raidmimic/register and b.wolfpack.quest/raidmimic/register. Public, no sign-in, marked [beta]: a NEW
// page ships live with the tag (CLAUDE.md, DECISIONS §135). Same bare shell as the landing and set-up pages.
// The fields, the cleaning and the hourly limit are RegisterForm.tsx + actions.ts + lib/guildInterest.ts.
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { isRaidmimicHost, RAIDMIMIC_SETUP_PATH, raidmimicSeo } from '@/lib/raidmimicHost';
import { LANDING_PATH_ON_HOST, LANDING_PATH_ON_WOLFPACK, RELEASES_URL } from '@/lib/raidmimicSetup';
import RegisterForm from './RegisterForm';
import HostFrame from '@/components/RaidmimicFrame';
import HomePanelGate from '../_landing/HomePanelGate';
import { DOWNLOAD_URL, STORY_BUTTON } from '@/lib/raidmimicPlayer';
import { GUILD_PRICE } from '@/lib/raidmimicStory';

const TITLE = 'Register your guild';
const DESCRIPTION =
  'Free to register: tell us about your raid guild, its game, size, raid nights and DKP tool. No sign-in, no card. Only guild hosting costs money, and only if you choose it.';

// Indexed on the raidmimic apex hosts with https://raidmimic.com/register as the canonical address; noindex on the
// Wolf Pack hosts and on b.raidmimic.com (web/lib/raidmimicHost.ts raidmimicSeo()).
export function generateMetadata(): Metadata {
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    ...raidmimicSeo(headers().get('host'), '/register'),
    openGraph: { title: TITLE, description: DESCRIPTION, siteName: 'Raid Mimic', type: 'website' },
    twitter: { card: 'summary' },
  };
}

export default function RaidmimicRegisterPage() {
  const onHost = isRaidmimicHost(headers().get('host'));
  const landing = onHost ? LANDING_PATH_ON_HOST : LANDING_PATH_ON_WOLFPACK;
  const setup = onHost ? '/setup' : RAIDMIMIC_SETUP_PATH;

  return (
    <HostFrame onHost={onHost}>
    {/* The 80 second story plays here and nowhere else (the guild lead, 2026-11-16, card rm-home). It sits outside the narrow column so the stage can span the page. */}
    <div className="mx-auto mb-4 max-w-5xl"><HomePanelGate label={STORY_BUTTON} downloadUrl={DOWNLOAD_URL} onHost={onHost} /></div>
    <div className="mx-auto max-w-xl pb-12">

      <header className="mb-5">
        <p className="text-xs uppercase tracking-widest text-gold">Raid Mimic</p>
        <h1 className="mt-1 text-3xl leading-tight text-text">Register your guild</h1>
        {/* Free to register, said first and plainly (the guild lead, 2026-11-17: "make it very clear that registering up
            front is free and only the hosting bits cost money"; no free month, §612). */}
        <div className="mt-4 rounded-md border-l-4 border-green bg-panel px-4 py-3 text-sm leading-6 text-text" data-free-note>
          <p className="font-semibold text-green">Registering is free.</p>
          <p className="mt-1">
            No sign-in, no card, no commitment. Only hosting costs money: Pro · Guild is ${GUILD_PRICE} a month, once guild
            hosting opens, and only if you choose it. The overlays stay free.
          </p>
        </div>
        <p className="mt-3 max-w-[60ch] text-sm leading-6 text-text">Only the guild name is required.</p>
      </header>

      <RegisterForm downloadHref={RELEASES_URL} setupHref={setup} />

      <p className="mt-6 text-xs leading-6 text-dim">
        We keep what you type, plus a one-way scramble of your network address for one day to limit spam. Links, emails and
        anything that looks like a password are removed before saving.{' '}
        <a href={landing}>Back to Raid Mimic</a>
      </p>
    </div>
    </HostFrame>
  );
}
