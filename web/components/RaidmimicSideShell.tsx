'use client';
// The side nav of the ?v=b shell, in PopShell's pattern (web/app/pop/PopShell.tsx): from lg up a sticky column beside
// the page listing the pages of the section you are in; below lg the same list is a collapsible bar stuck under the
// header, so a phone loses no width and scrolls nothing sideways. A page that belongs to no section with 2+ pages
// (and no About page) gets the body alone, full width. The list is links only and is drawn twice, CSS shows one.
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { pageIsCurrent, type RaidmimicSection } from '@/lib/raidmimicNav';
import { shellSectionOf } from '@/lib/raidmimicShell';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue';

function Panel({ section, path }: { section: RaidmimicSection; path: string }) {
  return (
    <nav aria-label={`${section.label} pages`}>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-dim">{section.label}</div>
      <ul className="m-0 list-none space-y-1 p-0">
        {section.pages.map(p => {
          const cur = pageIsCurrent(section, p, path);
          return (
            <li key={p.href}>
              <a href={p.href} aria-current={cur ? 'page' : undefined}
                className={`flex min-h-9 items-center rounded px-2.5 text-sm no-underline hover:no-underline ${FOCUS} ${cur ? 'bg-accent text-white' : 'text-text hover:bg-border/40'}`}>
                {p.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function RaidmimicSideShell({ children }: { children: ReactNode }) {
  const path = usePathname() || '/';
  const section = shellSectionOf(path);
  if (!section) return <div className="min-w-0">{children}</div>;
  const here = section.pages.find(p => pageIsCurrent(section, p, path));
  return (
    <div data-rm-side className="flex flex-col gap-4 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <details className="sticky top-14 z-30 rounded-lg border border-border bg-panel shadow-lg shadow-black/40 lg:hidden">
        <summary className={`flex min-h-10 cursor-pointer select-none items-center px-3 text-sm text-text ${FOCUS}`}>
          {section.label}{here ? <span className="text-dim">&nbsp;·&nbsp;{here.label}</span> : null}
        </summary>
        <div className="max-h-[70vh] overflow-y-auto border-t border-border/60 p-3"><Panel section={section} path={path} /></div>
      </details>
      <aside aria-label={`${section.label} pages`}
        className="hidden max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-border bg-panel p-3 lg:sticky lg:top-16 lg:block">
        <Panel section={section} path={path} />
      </aside>
      {/* A page body keeps its own reading width but starts beside the nav, not centred in what is left. */}
      <div className="min-w-0 lg:[&>*]:ml-0">{children}</div>
    </div>
  );
}
