// The top bars of the player-first drafts, drawn instead of HostBar (web/components/RaidmimicFrame.tsx stays as it is).
// "player" is the four player pages with one For-guild-leaders link at the far right (A and C); "minimal" is the logo and
// one Sign in (B). Same sticky, opaque box as HostBar. Server component; SignInButton is its only client piece.
import SignInButton from '@/components/SignInButton';
import { LEADER_NAV, PLAYER_NAV } from '@/lib/lab/fixtures/rm-home';
import { STORY_WORDS as W } from '@/lib/raidmimicStory';

const LINK = 'inline-flex min-h-11 items-center rounded px-2 text-sm text-dim hover:bg-panel hover:text-text hover:no-underline';

function Logo() {
  return (
    <a href="/" aria-label="Raid Mimic home" className="flex shrink-0 items-center gap-2 text-text hover:no-underline">
      <img src="/mimic-logo.png" alt="" width={36} height={36} className="block h-9 w-9 rounded-lg" />
      <span className="hidden text-base font-semibold sm:inline">Raid Mimic</span>
    </a>
  );
}

export default function VariantHostBar({ kind, signedIn }: { kind: 'player' | 'minimal'; signedIn: boolean }) {
  return (
    <header data-variant-bar={kind} className="sticky top-0 z-40 mb-6 border-b border-border bg-bg py-1">
      <div className="flex items-center gap-3">
        <Logo />
        {kind === 'player' ? (
          <nav aria-label="Raid Mimic" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
            {PLAYER_NAV.map((n, i) => (
              <a key={n.label} href={n.href} aria-current={i === 0 ? 'page' : undefined}
                className={`${LINK} ${i === 0 ? 'text-gold' : ''}`}>{n.label}</a>
            ))}
            <a href={LEADER_NAV.href} data-leader-link className={`${LINK} ml-auto`}>{LEADER_NAV.label}</a>
          </nav>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            {signedIn
              ? <a href="/characters" className={LINK}>My characters</a>
              : <SignInButton next={W.after} label={W.signIn} className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm text-text hover:border-gold" />}
          </div>
        )}
      </div>
    </header>
  );
}
