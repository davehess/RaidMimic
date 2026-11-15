// The data behind the Raid Mimic header (?v=b|c on beta): the three download chips and the "About" pages that belong to
// no section. The sections themselves come from raidmimicNav.ts, so the header, the side nav and the old link bar cannot
// disagree. Pure, no React, so a test can walk it. Every href is a path on a raidmimic host or the project's GitHub
// release pages, and none spells a Wolf Pack address (test/raidmimic-shell.test.js).

import { REPO_URL } from './eqmimicLanding';
import { RAIDMIMIC_SECTIONS, sectionOfPath, type RaidmimicSection } from './raidmimicNav';

export interface RmDownload { key: 'stable' | 'beta' | 'linux'; label: string; name: string; href: string; title: string }

// A raidmimic host serves no /mimic download route (the middleware sends every unknown path to the landing page), so the
// chips go where the site's own Download button already goes: the GitHub release pages. Beta and Linux open the releases
// list filtered by the tag text, because GitHub has no per-channel "latest" address.
export const RM_DOWNLOADS: readonly RmDownload[] = [
  { key: 'stable', label: 'Download', name: 'Download Raid Mimic', href: `${REPO_URL}/releases/latest`,
    title: 'The latest stable Raid Mimic installer for Windows.' },
  { key: 'beta', label: 'Beta', name: 'Download Raid Mimic beta', href: `${REPO_URL}/releases?q=beta`,
    title: 'The beta channel: newer features, less settled. Grab it only if you are testing.' },
  { key: 'linux', label: 'Linux', name: 'Download Raid Mimic for Linux and Steam Deck', href: `${REPO_URL}/releases?q=linux`,
    title: 'Linux and Steam Deck builds (experimental).' },
];

/** The pages that sit in no section: the side nav and the tab row show them as "About". Order is the footer's. */
export const RM_ABOUT: RaidmimicSection = {
  key: 'about', label: 'About', href: '/costs',
  prefixes: ['/costs', '/privacy', '/security', '/terms', '/refunds'],
  pages: [
    { label: 'What it costs', href: '/costs' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Security', href: '/security' },
    { label: 'Terms', href: '/terms' },
    { label: 'Refunds', href: '/refunds' },
  ],
};

const norm = (p: string) => (p.split(/[?#]/)[0].replace(/\/+$/, '') || '/').toLowerCase();

/** The section whose pages the side nav and tab row list: a real section with 2+ pages, else About, else none. */
export function shellSectionOf(path: string): RaidmimicSection | null {
  const s = sectionOfPath(path);
  if (s && s.pages.length >= 2) return s;
  const p = norm(path);
  return RM_ABOUT.prefixes.some(pre => p === pre || p.startsWith(`${pre}/`)) ? RM_ABOUT : null;
}

/** The header's dropdown buttons: the sections of raidmimicNav, unchanged. */
export const RM_HEADER_SECTIONS: readonly RaidmimicSection[] = RAIDMIMIC_SECTIONS;
