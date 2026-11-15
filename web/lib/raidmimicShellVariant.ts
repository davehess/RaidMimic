// Which shell a raidmimic.com page wears (the guild lead, 2026-11-15: "the formatting we have on Wolfpack.quest is what we
// should be using here"). Three shells, picked as previews on beta and nowhere else:
//   a  the shell production has (the narrow column and the small centred link bar). The default.
//   b  the Wolf Pack header and footer plus a side nav of the section's pages (the recommended one).
//   c  the same header and footer, the section's pages as a tab row under the header.
// A layout cannot read a query string, so middleware sees `?v=b|c|a` on the way in, writes the `rm_shell` cookie and
// redirects to the same address without `?v=`; the frame (components/RaidmimicFrame.tsx) reads the cookie. The same
// pattern as the admin sidebar preview (lib/adminShell.ts). Pure, so the Edge middleware and the test share one decision.

import { isRaidmimicBetaHost } from './raidmimicHost';

export type RmShell = 'a' | 'b' | 'c';

export const RM_SHELL_COOKIE = 'rm_shell';

/** A month: long enough to survive a week away, short enough that the preview does not outlive the pick. */
export const RM_SHELL_MAX_AGE = 60 * 60 * 24 * 30;

/** Production must never change: only the beta mirror (b.raidmimic.com) or a beta build honours the variant at all. `isBetaBuild` is NEXT_PUBLIC_IS_BETA === '1'. */
export function rmShellHonoured(host: string | null | undefined, isBetaBuild: boolean): boolean {
  return isBetaBuild || isRaidmimicBetaHost(host);
}

const isShell = (v: unknown): v is RmShell => v === 'a' || v === 'b' || v === 'c';

/** What `?v=` does to the cookie: b and c set it, a clears it, anything else leaves it alone. */
export function rmShellAction(v: string | null | undefined): 'set' | 'clear' | null {
  if (v === 'b' || v === 'c') return 'set';
  if (v === 'a') return 'clear';
  return null;
}

/** The shell for a request: the cookie when the host honours it and it names b or c, otherwise a (production's). */
export function rmShellFor(host: string | null | undefined, cookie: string | undefined, isBetaBuild: boolean): RmShell {
  if (!rmShellHonoured(host, isBetaBuild)) return 'a';
  return isShell(cookie) && cookie !== 'a' ? cookie : 'a';
}
