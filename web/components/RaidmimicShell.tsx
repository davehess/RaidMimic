// The frame of every raidmimic.com page (the guild lead, 2026-11-15, Decision Desk rm-shell: option B): Wolf Pack's header
// (logo, download chips, section menus, sign-in), a side nav of the section's pages, and a Wolf Pack-style footer. Server
// component; the header and side nav are the client pieces (they need the path). Only a raidmimic host draws it: the Wolf
// Pack hosts have their own header and footer (HostFrame in RaidmimicFrame.tsx passes the page through there).
import type { ReactNode } from 'react';
import AuthBadge from '@/components/AuthBadge';
import RaidmimicHeader from '@/components/RaidmimicHeader';
import RaidmimicShellFooter from '@/components/RaidmimicShellFooter';
import RaidmimicSideShell from '@/components/RaidmimicSideShell';

/** The page's own width cap is ignored: the shell sets Wolf Pack's, and a page that is narrower stays narrow inside it. */
export default function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <RaidmimicHeader authBadge={<AuthBadge />} />
      <div className="mx-auto w-full max-w-6xl pt-4 sm:pt-6">
        <RaidmimicSideShell>{children}</RaidmimicSideShell>
        <RaidmimicShellFooter />
      </div>
    </>
  );
}
