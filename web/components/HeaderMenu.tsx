'use client';
// One small dropdown for the header bars: a button that opens a list of links.
// Used for the wolfpack.quest "More" menu and the raidmimic.com "Download" menu (the guild lead, 2026-11-16, design
// review: one Download button instead of three chips; rarely used controls grouped, not removed).
// Accessible: a real button with aria-expanded/aria-haspopup, role="menu" items, Escape closes and returns focus to the
// button, a click outside closes, ArrowDown from the button moves into the list, Arrow keys move between items.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type HeaderMenuItem = { key: string; href: string; label: ReactNode; title?: string; external?: boolean; ariaLabel?: string };

export default function HeaderMenu({
  label, ariaLabel, title, items, className, buttonClassName, align = 'left',
}: {
  label: ReactNode;
  ariaLabel: string;
  title?: string;
  items: readonly HeaderMenuItem[];
  className?: string;
  buttonClassName: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    };
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const focusItem = (delta: number | 'first') => {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!els.length) return;
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = delta === 'first' ? 0 : (at + delta + els.length) % els.length;
    els[next].focus();
  };

  return (
    <div ref={wrap} className={`relative ${className ?? ''}`}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setTimeout(() => focusItem('first'), 0); }
        }}
        className={buttonClassName}
      >
        {label}
        <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1.2 5 4.8 9 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(-1); }
          }}
          className={`absolute top-full z-50 min-w-[13rem] pt-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <div className="rounded-lg border border-border bg-panel p-1 shadow-lg shadow-black/40">
            {items.map(it => (
              <a
                key={it.key}
                role="menuitem"
                href={it.href}
                title={it.title}
                aria-label={it.ariaLabel}
                {...(it.external ? { target: '_blank', rel: 'noreferrer' } : {})}
                onClick={() => setOpen(false)}
                className="flex min-h-9 items-center gap-2 rounded px-3 text-sm text-text no-underline hover:bg-border/40 hover:no-underline focus-visible:bg-border/40 focus-visible:outline-none"
              >
                {it.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
