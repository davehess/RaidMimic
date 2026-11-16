'use client';

// CopyChip — a small button that copies one line for pasting into EQ: a /say
// keyword or a /map Y X (the guild lead, 2026-09-28). Shared by the PoP
// checklist and the missing-spells vendor list.

import { useState } from 'react';

export default function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers or a denied permission: fall back to a selection copy.
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  // A multi-line text (a script) is named by its label, not spelled out in the tooltip.
  const what = text.includes('\n') ? (label ?? 'text') : text;
  return (
    <button type="button" onClick={copy} title={`Copy “${what}”`} aria-label={`Copy ${what}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-bg text-text hover:border-blue font-mono text-[11px] max-w-full">
      <span className="truncate">{label ?? text}</span>
      <span className={copied ? 'text-green' : 'text-dim'} aria-live="polite">{copied ? '✓' : '⧉'}</span>
    </button>
  );
}
