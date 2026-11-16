'use client';

// The little chip on b.wolfpack.quest that switches the design-system preview (lib/designPreview.ts) without editing
// the URL. Rendered by app/layout.tsx ONLY when the build is the beta mirror, so it never exists on production.
// It writes the same wp_ds cookie the middleware does, then reloads so the server puts data-ds on <html>.
import { useEffect, useState } from 'react';
import { DS_COOKIE, DS_MAX_AGE, isDs, type DsValue } from '@/lib/designPreview';

const CHOICES: { key: DsValue | 'off'; label: string; hint: string }[] = [
  { key: 'off', label: 'Current', hint: 'Today’s look, as on production' },
  { key: 'a', label: 'A', hint: 'Mono voice, one title style' },
  { key: 'b', label: 'B', hint: 'Sans voice, one title style' },
  { key: 'c', label: 'C', hint: 'Mono body, serif titles' },
];

export default function DesignSwitch({ current }: { current: DsValue | null }) {
  const [open, setOpen] = useState(false);
  const pick = (k: DsValue | 'off') => {
    try {
      document.cookie = k === 'off'
        ? `${DS_COOKIE}=; path=/; max-age=0; samesite=lax`
        : `${DS_COOKIE}=${k}; path=/; max-age=${DS_MAX_AGE}; samesite=lax`;
    } catch { /* cookies blocked: nothing to switch */ }
    window.location.reload();
  };
  // A statically built page cannot tell the server the voice, so read what <html> actually carries after mount.
  const [seen, setSeen] = useState<DsValue | null>(current);
  useEffect(() => {
    const v = document.documentElement.getAttribute('data-ds');
    setSeen(isDs(v) ? v : null);
  }, []);
  const now = seen ?? 'off';
  return (
    <div className="fixed bottom-3 right-3 z-[60] font-sans text-xs">
      {open ? (
        <div role="group" aria-label="Design preview" className="flex items-center gap-1 rounded-full border border-border bg-panel/95 p-1 shadow-lg backdrop-blur">
          <span className="px-2 text-text2">Design</span>
          {CHOICES.map(c => (
            <button
              key={c.key} type="button" title={c.hint} aria-pressed={now === c.key} onClick={() => pick(c.key)}
              className={`min-h-[32px] rounded-full px-3 py-1 ${now === c.key ? 'bg-accent text-bone' : 'text-text hover:bg-raised'}`}
            >{c.label}</button>
          ))}
          <button type="button" aria-label="Close design switcher" onClick={() => setOpen(false)} className="min-h-[32px] rounded-full px-2 text-text2 hover:bg-raised">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="min-h-[36px] rounded-full border border-border bg-panel/95 px-3 py-1 text-text shadow-lg hover:bg-raised">
          Design: {now === 'off' ? 'current' : now.toUpperCase()}
        </button>
      )}
    </div>
  );
}
