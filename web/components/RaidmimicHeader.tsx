'use client';
// The Raid Mimic header (the guild lead, 2026-11-15, on raidmimic.com: "the formatting we have on Wolfpack.quest is what we
// should be using here"; picked as option B the same day). Modelled on SiteHeader and Nav: a full-width sticky bar with the
// logo and name, one Download menu beside it (Windows stable / beta / Linux, 2026-11-16), the sections as dropdown buttons in the middle and the account block
// at the right; below lg the sections fold into one Menu.
// The account block is handed in (the server's AuthBadge), so this file reads no session. Tokens only, no new colours.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DownloadArrow } from '@/components/HeaderIcons';
import HeaderMenu from '@/components/HeaderMenu';
import { pageIsCurrent, sectionOfPath, type RaidmimicSection } from '@/lib/raidmimicNav';
import { RM_DOWNLOADS, RM_HEADER_SECTIONS } from '@/lib/raidmimicShell';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue';
const chip = `inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded border px-3 text-sm no-underline transition-colors hover:no-underline ${FOCUS}`;
const idle = 'border-border bg-panel text-text hover:bg-border/40';
const active = 'border-accent bg-accent text-white';

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="M1 1.2 5 4.8 9 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ONE Download button with a small menu (the guild lead, 2026-11-16, design review: three chips ahead of the nav read as
// clutter). Same three URLs as before, from RM_DOWNLOADS.
const MENU_LABEL: Record<string, string> = { stable: 'Windows (stable)', beta: 'Windows beta', linux: 'Linux / Steam Deck' };
function DownloadMenu() {
  const items = RM_DOWNLOADS.map(d => ({
    key: d.key, href: d.href, label: MENU_LABEL[d.key] ?? d.label, title: d.title, ariaLabel: d.name, external: true,
  }));
  return (
    <HeaderMenu
      className="shrink-0"
      label={<><DownloadArrow className="scale-110" /><span>Download</span></>}
      ariaLabel="Download Raid Mimic"
      title="Download Raid Mimic: Windows (stable), Windows beta, or Linux / Steam Deck."
      items={items}
      buttonClassName={`${chip} border-blue bg-accent/20 text-blue hover:bg-accent/40`}
    />
  );
}

function SectionMenu({ sections, path }: { sections: readonly RaidmimicSection[]; path: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [canHover, setCanHover] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const current = sectionOfPath(path);

  // Hover opens only where hover exists, click toggles only where it does not (the two fought on touch screens in Nav.tsx).
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setCanHover(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div ref={wrap} className="flex items-center gap-2" onMouseLeave={() => { if (canHover) setOpen(null); }}>
      {sections.map(s => {
        const on = open === s.key;
        const here = current?.key === s.key;
        if (s.pages.length < 2) {
          return <a key={s.key} href={s.href} aria-current={here ? 'true' : undefined} className={`${chip} ${here ? active : idle}`}>{s.label}</a>;
        }
        return (
          <div key={s.key} className="relative">
            <button type="button" aria-expanded={on} aria-controls={`rm-nav-${s.key}`}
              onClick={() => setOpen(on && !canHover ? null : s.key)}
              onMouseEnter={() => { if (canHover) setOpen(s.key); }}
              className={`${chip} ${on || here ? active : idle}`}>
              {s.label}<Chevron open={on} />
            </button>
            {on && (
              <div id={`rm-nav-${s.key}`} role="group" aria-label={`${s.label} pages`}
                className="absolute left-0 top-full z-50 min-w-[13rem] pt-1">
                <div className="rounded-lg border border-border bg-panel p-1 shadow-lg shadow-black/40">
                  {s.pages.map(p => {
                    const cur = pageIsCurrent(s, p, path);
                    return (
                      <a key={p.href} href={p.href} aria-current={cur ? 'page' : undefined}
                        className={`flex min-h-9 items-center rounded px-3 text-sm no-underline hover:no-underline ${FOCUS} ${cur ? 'bg-accent text-white' : 'text-text hover:bg-border/40'}`}>
                        {p.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MenuPanel({ path }: { path: string }) {
  return (
    <div id="rm-menu" className="border-t border-border/60 bg-panel/95">
      <div className="mx-auto max-h-[70vh] max-w-7xl overflow-y-auto px-3 py-3 sm:px-4">
        {RM_HEADER_SECTIONS.map((s, i) => (
          <div key={s.key} className={i ? 'mt-3' : ''}>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">{s.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {s.pages.map(p => {
                const cur = s.pages.length > 1 ? pageIsCurrent(s, p, path) : sectionOfPath(path)?.key === s.key;
                return (
                  <a key={p.href} href={p.href} aria-current={cur ? 'page' : undefined}
                    className={`inline-flex min-h-9 items-center rounded border px-3 text-sm no-underline hover:no-underline ${FOCUS} ${cur ? active : 'border-border bg-bg text-text hover:bg-border/40'}`}>
                    {p.label}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RaidmimicHeader({ authBadge }: { authBadge: ReactNode }) {
  const path = usePathname() || '/';
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLElement>(null);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [menu]);

  return (
    // The bleed cancels the root layout's own padding so the bar runs edge to edge, like Wolf Pack's.
    <header ref={wrap} data-rm-shell
      className="sticky top-0 z-40 -mx-3 -mt-3 border-b border-border/60 bg-bg/95 backdrop-blur sm:-mx-4 sm:-mt-4">
      <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-3 py-2 sm:px-4">
        <a href="/" aria-label="Raid Mimic home" className={`flex shrink-0 items-center gap-2 rounded no-underline hover:no-underline ${FOCUS}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mimic-logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] rounded-md" />
          <span className="hidden whitespace-nowrap text-base font-bold text-white sm:inline lg:text-xl">Raid Mimic</span>
        </a>
        <DownloadMenu />
        <div className="mx-auto hidden lg:block"><SectionMenu sections={RM_HEADER_SECTIONS} path={path} /></div>
        <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-controls="rm-menu"
          className={`${chip} ml-1 lg:hidden ${menu ? active : idle}`}>
          Menu<Chevron open={menu} />
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0 [&_a]:inline-flex [&_a]:min-h-9 [&_a]:items-center [&_button]:min-h-9">{authBadge}</div>
      </div>
      {menu && <div className="lg:hidden"><MenuPanel path={path} /></div>}
    </header>
  );
}
