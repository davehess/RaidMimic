// The frame every raidmimic.com page sits in (the guild lead, 2026-11-15: "the formatting we have on Wolfpack.quest is what we
// should be using here"; option B). The root layout gives a raidmimic host a bare shell with no width and no chrome
// (web/app/layout.tsx), so each page wraps itself in this: on a raidmimic host it becomes Wolf Pack's header, a side nav of the
// section's pages and the footer (RaidmimicShell.tsx). On a Wolf Pack host it renders the children alone, because the Wolf Pack
// layout already has both. Server component. Lives in components/ because web/app/raidmimic/_landing/ is pinned to the landing
// page's files.
import ShellFrame from '@/components/RaidmimicShell';

/** `width` is accepted so every page's call stays as it was; the shell sets the width now. */
export default function HostFrame({ onHost, children }: {
  onHost: boolean; width?: string; children: React.ReactNode;
}) {
  if (!onHost) return <>{children}</>;
  return <ShellFrame>{children}</ShellFrame>;
}
