// The raidmimic.com footer (the shell the guild lead picked, Desk rm-shell B), modelled on Wolf Pack's (web/app/layout.tsx): a line about where the data lives,
// the small-print links (privacy, security, terms, refunds, contact, costs) and the quietest thing last, the
// EverQuest trademark notice. Server component; the sentences come from the shared lists, none is written here twice.
import LegalLinks from '@/components/LegalLinks';
import { REPO_URL, RIGHTS_NOTICE } from '@/lib/raidmimicLanding';

export default function RaidmimicShellFooter() {
  return (
    <footer className="mt-12 space-y-1 border-t border-border/60 pt-4 text-xs text-dim">
      <div>
        Raid Mimic reads the log EverQuest already writes. Your logs stay on your device; guild features share only what you switch on.
      </div>
      {/* Two rows, so a phone never wraps a row and leaves a separator dangling at its end. */}
      <div className="[&_a]:inline-flex [&_a]:min-h-9 [&_a]:items-center [&_a]:text-blue">
        <LegalLinks onHost />
      </div>
      <div className="[&_a]:inline-flex [&_a]:min-h-9 [&_a]:items-center [&_a]:text-blue">
        <a href="/costs">What it costs to run</a> <span aria-hidden>&middot;</span>{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">Source code</a>
      </div>
      <div className="pt-2 text-dim/70">{RIGHTS_NOTICE}</div>
    </footer>
  );
}
