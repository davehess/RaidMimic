// /characters/<name>: ONE of a Raid Mimic player's own characters (the guild lead, 2026-11-15: "permit the character page
// similar to the Wolfpack site"). The PoP flag summary the /characters card shows, plus the gear and bags from an uploaded
// inventory or Quarmy file, modelled on Wolf Pack's /character/<name>/gear page but fed only by the hub_* tables.
//
// Private to its owner: every read below is keyed on the player id found from the SESSION's Discord id. The URL carries a
// name only to pick among that player's own characters, so a name the player does not hold, or another player's, is a
// plain 404 that reads exactly like a name nobody holds. Player-supplied text renders as plain text. A signed-out visitor
// is asked to sign in and told nothing about the name. The hub_* tables may be absent on a database the registry has not
// been applied to; reads fail soft.
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import { discordIdOf } from '@/lib/lockout';
import { isRaidmimicHost } from '@/lib/raidmimicHost';
import { loadMine } from '@/lib/hubMine';
import { NAME_RX } from '@/lib/hubImport';
import { loadInventory } from '@/lib/hubInventoryDb';
import SignInButton from '@/components/SignInButton';
import HostFrame from '@/components/RaidmimicFrame';
import FlagsBody from '../FlagsBody';
import InventoryUpload from '../InventoryUpload';
import MimicNote from '../MimicNote';
import InventoryView from './InventoryView';

const TITLE = 'Character';
const DESCRIPTION = 'One of your characters on Raid Mimic: its Planes of Power flag progress and what it needs next, plus its gear and bags from an uploaded inventory or Quarmy file. Private to you.';

// The tab never names the character: it would come from the URL, and this page is private.
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

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return ''; }
}

export default async function CharacterPage({ params }: { params: { name: string } }) {
  const name = safeDecode(params.name).trim();
  if (!NAME_RX.test(name)) notFound();
  const onHost = isRaidmimicHost(headers().get('host'));
  const { data: { user } } = await supabaseServer().auth.getUser();
  const discordId = discordIdOf(user);

  if (!user || !discordId) {
    return (
      <HostFrame onHost={onHost}>
        <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
          <h1 className="text-2xl text-gold">Character</h1>
          <p className="mt-2 text-sm text-dim">Sign in with Discord to see your character. Only its owner can open this page.</p>
          <div className="mt-4"><SignInButton next={`/characters/${encodeURIComponent(name)}`} /></div>
        </div>
      </HostFrame>
    );
  }

  const lc = name.toLowerCase();
  const mine = await loadMine(discordId);
  const view = mine.find(c => c.name.toLowerCase() === lc);
  if (!view) notFound();

  // The player's own id, from the session's Discord id. Fail soft to "no gear yet" if it cannot be read.
  const admin = supabaseAdmin();
  const { data: player } = await admin.from('hub_players').select('player_id').eq('discord_id', discordId).is('deleted_at', null).maybeSingle();
  const sets = player ? await loadInventory(admin, player.player_id as string, lc) : [];

  // Icons are public item-catalog data, looked up by the ids in the player's own files.
  const icons: Record<number, number | null> = {};
  const ids = [...new Set(sets.flatMap(s => s.items.map(i => i.item_id).filter((x): x is number => !!x)))].slice(0, 800);
  if (ids.length) {
    try {
      const { data } = await admin.from('eqemu_items').select('id, icon').in('id', ids).limit(800);
      for (const r of data ?? []) icons[r.id as number] = (r.icon as number | null) ?? null;
    } catch { /* names still show without art */ }
  }

  const flagsOnly = sets.length === 0;
  return (
    <HostFrame onHost={onHost}>
      <div className="mx-auto max-w-3xl px-1 py-2 pb-12">
        <p className="text-xs"><Link href="/characters" className="text-blue">&larr; My characters</Link></p>
        <h1 className="mt-1 text-2xl text-gold">{view.name}</h1>
        <p className="mt-1 text-sm text-dim">
          {view.flagCount} flag{view.flagCount === 1 ? '' : 's'}{view.lastExport ? ` · export of ${view.lastExport.slice(0, 10)}` : ''}
          {view.proof === 'contested' ? ' · name claimed by another player too' : ''}. Only you can see this page.
        </p>

        <section aria-label="PoP flags" className={`mt-4 ${CARD}`}>
          <h2 className="text-lg text-text">Planes of Power flags</h2>
          <FlagsBody c={view} />
        </section>

        <section aria-label="Gear and bags" className="mt-6">
          <h2 className="text-lg text-text">Gear and bags</h2>
          {flagsOnly ? (
            <p className="mt-1 text-sm text-dim">
              Only PoP flags are loaded for {view.name}. Add its inventory file, its Quarmy file, or both, and its gear and bags show here.
            </p>
          ) : (
            <div className="mt-2"><InventoryView sets={sets} icons={icons} /></div>
          )}
          <div className="mt-3">
            <InventoryUpload only={view.name} heading={flagsOnly ? `Add ${view.name}'s inventory or Quarmy file` : 'Replace with a newer file'} />
            <MimicNote />
          </div>
        </section>
      </div>
    </HostFrame>
  );
}
