// The ?v=b and ?v=c shells of the raidmimic.com pages (the guild lead, 2026-11-15; lib/raidmimicShellVariant.ts says how a
// variant is chosen and kept). b: Wolf Pack's header, a side nav of the section's pages, Wolf Pack's footer. c: the same
// header and footer, the section's pages as a tab row under the header. Server component; the header, side nav and tab row
// are the client pieces (they need the path). `currentShell()` is the one place that reads the cookie, and it answers `a`
// (the frame production has) on every host that is not the beta mirror, whatever the cookie says.
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import AuthBadge from '@/components/AuthBadge';
import RaidmimicHeader from '@/components/RaidmimicHeader';
import RaidmimicShellFooter from '@/components/RaidmimicShellFooter';
import RaidmimicSideShell from '@/components/RaidmimicSideShell';
import { RM_SHELL_COOKIE, rmShellFor, rmShellHonoured, type RmShell } from '@/lib/raidmimicShellVariant';

export function currentShell(): RmShell {
  const host = headers().get('host');
  const beta = process.env.NEXT_PUBLIC_IS_BETA === '1';
  if (!rmShellHonoured(host, beta)) return 'a';   // production never even reads the cookie
  return rmShellFor(host, cookies().get(RM_SHELL_COOKIE)?.value, beta);
}

/** `variant` is b or c. The page's own width cap is ignored: the shell sets Wolf Pack's, and a page that is narrower stays narrow inside it. */
export default function ShellFrame({ variant, children }: { variant: 'b' | 'c'; children: ReactNode }) {
  return (
    <>
      <RaidmimicHeader variant={variant} authBadge={<AuthBadge />} />
      <div className="mx-auto w-full max-w-6xl pt-4 sm:pt-6">
        {variant === 'b' ? <RaidmimicSideShell>{children}</RaidmimicSideShell> : <div className="min-w-0">{children}</div>}
        <RaidmimicShellFooter />
      </div>
    </>
  );
}
