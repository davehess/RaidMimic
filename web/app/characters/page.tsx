// /characters: "My characters" on raidmimic.com (the guild lead, 2026-11-09, DECISIONS §545: Raid Mimic takes in the
// Zeal `<Name>-PoPFlags.txt` export so anyone can load their characters). A player uploads one or more of those files
// and sees each character's PoP flag progress and what it needs next.
//
// New page, so it goes live with the [beta] tag. Signed-in players only, and ONLY the signed-in player's own
// characters are read or shown: every read below is keyed on the player id taken from the session. Nothing on this page
// is shown to anyone else in this step. Everything player-supplied (names) renders as plain text.
// The hub_* tables may not exist on a database the registry has not been applied to; the read fails soft to "none yet".
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import Link from 'next/link';
import { discordIdOf } from '@/lib/lockout';
import { isRaidmimicHost } from '@/lib/raidmimicHost';
import { loadMine } from '@/lib/hubMine';
import { supabaseAdmin } from '@/lib/supabase';
import { sourcesByCharacter } from '@/lib/hubInventoryDb';
import { MAX_CHARACTERS_PER_PLAYER } from '@/lib/hubImport';
import SignInButton from '@/components/SignInButton';
import HostFrame from '@/components/RaidmimicFrame';
import LoadBlock from './LoadBlock';
import GateTable from '@/app/pop/guide/GateTable';
import { GATES } from '@/lib/popGatePieces';
import { gateKeyOr } from '@/lib/popGateStatus';
import { matrixRows, overallRows, wantsOverall } from '@/lib/hubCharactersView';
import RemoveButton from './RemoveButton';
import FlagsBody from './FlagsBody';

const GATE_CHOICES = GATES.map(g => ({ key: g.key, name: g.name, short: g.short }));
const TITLE = 'My characters';
const DESCRIPTION = 'Load your characters on Raid Mimic from the PoPFlags file Zeal saves when you camp, and see each one’s Planes of Power flag progress and what it needs next.';

// On a raidmimic host the tab says Raid Mimic, not the root layout's WolfPack.quest suffix.
export function generateMetadata(): Metadata {
  const onHost = isRaidmimicHost(headers().get('host'));
  return {
    title: onHost ? { absolute: `${TITLE} · Raid Mimic` } : TITLE,
    description: DESCRIPTION,
    robots: { index: false, follow: false },
  };
}

export const dynamic = 'force-dynamic';

const CARD = 'rounded-lg border border-border bg-panel p-4';

export default async function CharactersPage({ searchParams }: { searchParams?: { gate?: string } }) {
  const onHost = isRaidmimicHost(headers().get('host'));
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);
  // The [beta] tag came off 2026-11-15 (the guild lead: "remove the beta tag once it's live").
  const note = null;

  if (!user || !discordId) {
    return (
      <HostFrame onHost={onHost}>
        <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
          {note}
          <h1 className="text-2xl text-gold">My characters</h1>
          <p className="mt-2 text-sm text-dim">Sign in with Discord to load your characters.</p>
          <div className="mt-4"><SignInButton next="/characters" /></div>
        </div>
      </HostFrame>
    );
  }

  const mine = await loadMine(discordId);
  const gateKey = gateKeyOr(searchParams?.gate);
  const overall = wantsOverall(searchParams?.gate);
  // Which characters have gear uploaded (for the card's one line). Keyed on the session player; "none yet" if unreadable.
  let withGear = new Map<string, string[]>();
  if (mine.length > 0) {
    const admin = supabaseAdmin();
    const { data: player } = await admin.from('hub_players').select('player_id').eq('discord_id', discordId).is('deleted_at', null).maybeSingle();
    if (player) withGear = await sourcesByCharacter(admin, player.player_id as string);
  }
  return (
    <HostFrame onHost={onHost}>
      <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
        {note}
        <h1 className="text-2xl text-gold">My characters</h1>
        <p className="mt-1 text-sm text-dim">Only you can see this page.</p>

        <section aria-label="Load characters" className="mt-4">
          <LoadBlock max={MAX_CHARACTERS_PER_PLAYER} held={mine.length} />
        </section>

        {mine.length > 0 && (
          <section aria-label="Flag matrix" className="mt-6">
            <GateTable gates={GATE_CHOICES} selected={gateKey} rows={matrixRows(mine, gateKey)}
              hrefFor={k => `/characters?gate=${k}`} singleHref="#your-characters"
              overall={{ href: '/characters?gate=overall', active: overall, rows: overallRows(mine) }} />
          </section>
        )}

        <section id="your-characters" aria-label="Your characters" className="mt-6 space-y-3">
          {mine.length === 0 && <p className="text-sm text-dim">No characters yet.</p>}
          {/* Every character collapsed, most flags first (the guild lead, 2026-11-17). */}
          {[...mine].sort((a, b) => b.flagCount - a.flagCount || a.name.localeCompare(b.name)).map(c => (
            <details key={c.name} className={`group ${CARD}`}>
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                <span aria-hidden className="text-dim transition-transform group-open:rotate-90">▸</span>
                <span className="text-lg text-text">{c.name}</span>
                <span className="text-xs text-dim">{c.flagCount} flag{c.flagCount === 1 ? '' : 's'}{c.lastExport ? ` · export of ${c.lastExport.slice(0, 10)}` : ''}</span>
                {c.proof === 'contested' && <span className="rounded border border-orange/50 px-2 text-xs text-orange">name claimed by another player too</span>}
              </summary>

              <FlagsBody c={c} />

              <p className="mt-3 text-sm">
                {withGear.has(c.name.toLowerCase())
                  ? <span className="text-dim">Gear loaded.</span>
                  : <span className="text-dim">No gear yet.</span>}{' '}
                <Link href={`/characters/${encodeURIComponent(c.name)}`} className="text-blue">
                  {withGear.has(c.name.toLowerCase()) ? 'Open' : 'Add gear'}
                </Link>
              </p>

              <RemoveButton name={c.name} />
            </details>
          ))}
        </section>
      </div>
    </HostFrame>
  );
}
