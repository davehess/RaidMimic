// One drawn icon set, one stroke weight, one grid. Replaces the emoji the
// landing page used to lean on: an emoji renders differently on every OS and
// belongs to no design system, which makes it the fastest way to tell a
// visitor the page was assembled rather than built.
type IconProps = { className?: string };
const base = 'stroke-current fill-none';

function Frame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" strokeWidth="1.5"
         strokeLinecap="round" strokeLinejoin="round"
         className={`${base} ${className}`} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconParse = (p: IconProps) => (
  <Frame {...p}><path d="M3 16V8M7.5 16V4M12 16v-6M16.5 16v-9" /><path d="M2 18h16" /></Frame>
);
export const IconTimer = (p: IconProps) => (
  <Frame {...p}><circle cx="10" cy="11" r="6.4" /><path d="M10 7.6V11l2.6 1.7M7.6 2.6h4.8" /></Frame>
);
export const IconBlades = (p: IconProps) => (
  <Frame {...p}><path d="M3.4 3.4 12 12M16.6 3.4 8 12" /><path d="M6.2 16.4 8 12M13.8 16.4 12 12" /><path d="M10.4 13.6 13.6 10.4M6.4 10.4 9.6 13.6" /></Frame>
);
export const IconRank = (p: IconProps) => (
  <Frame {...p}><path d="M10 3.2 12 7.4l4.6.6-3.3 3.2.8 4.6L10 13.6 5.9 15.8l.8-4.6L3.4 8l4.6-.6Z" /></Frame>
);
export const IconMap = (p: IconProps) => (
  <Frame {...p}><path d="M2.8 5.4 7.4 3.4v11.2L2.8 16.6ZM7.4 3.4l5.2 2v11.2l-5.2-2ZM12.6 5.4l4.6-2v11.2l-4.6 2Z" /></Frame>
);
export const IconSpark = (p: IconProps) => (
  <Frame {...p}><path d="M10 2.4 11.6 8 17 9.8 11.6 11.6 10 17.2 8.4 11.6 3 9.8 8.4 8Z" /></Frame>
);

// Second batch (2026-11-17): the icons the pop pages, the raid review and the
// parse page used to draw with emoji. Same grid, same stroke; geometry only.
export const IconTrial = (p: IconProps) => (
  <Frame {...p}><path d="M3 17h14M10 2.8 3.4 7h13.2Z" /><path d="M5.5 8.5v6.5M10 8.5v6.5M14.5 8.5v6.5" /></Frame>
);
export const IconQuest = (p: IconProps) => (
  <Frame {...p}><path d="M5.5 3.5h9v11.5a2 2 0 0 1-2 2h-9a2 2 0 0 0 2-2Z" /><path d="M8 7.5h4M8 10.5h4" /></Frame>
);
export const IconLoot = (p: IconProps) => (
  <Frame {...p}><path d="M3 9V7.5A3.5 3.5 0 0 1 6.5 4h7A3.5 3.5 0 0 1 17 7.5V9" /><path d="M3 9h14v7.5H3Z" /><path d="M10 9v3" /></Frame>
);
export const IconDeath = (p: IconProps) => (
  <Frame {...p}><path d="M10 2.8a6 6 0 0 0-6 6c0 2.2 1.2 3.6 2.4 4.4V16h7.2v-2.8c1.2-.8 2.4-2.2 2.4-4.4a6 6 0 0 0-6-6Z" /><circle cx="7.6" cy="9.4" r="1" /><circle cx="12.4" cy="9.4" r="1" /></Frame>
);
export const IconSolo = (p: IconProps) => (
  <Frame {...p}><circle cx="10" cy="6" r="2.6" /><path d="M4.8 17c0-3.2 2.3-5.4 5.2-5.4s5.2 2.2 5.2 5.4" /></Frame>
);
export const IconGroup = (p: IconProps) => (
  <Frame {...p}><circle cx="7.5" cy="6.5" r="2.3" /><path d="M3 16.5c0-2.8 1.9-4.6 4.5-4.6s4.5 1.8 4.5 4.6" /><circle cx="14" cy="7.5" r="1.9" /><path d="M13.6 12c2.3 0 3.9 1.5 3.9 3.8" /></Frame>
);
export const IconHail = (p: IconProps) => (
  <Frame {...p}><path d="M3.5 4h13v9h-6L6.5 16.5V13h-3Z" /></Frame>
);
export const IconTouch = (p: IconProps) => (
  <Frame {...p}><path d="M7 11V4.6a1.2 1.2 0 0 1 2.4 0V9M9.4 8.4V3.8a1.2 1.2 0 0 1 2.4 0V9M11.8 9V5a1.2 1.2 0 0 1 2.4 0v6.5c0 3.2-1.6 5-4.2 5-2.2 0-3.4-1-4.6-3L3.8 10.8a1.2 1.2 0 0 1 2-1.3Z" /></Frame>
);
export const IconCallout = (p: IconProps) => (
  <Frame {...p}><path d="M3.5 8v4h3l7 3.5v-11L6.5 8Z" /><path d="M16.5 8.5v3" /></Frame>
);
export const IconReplay = (p: IconProps) => (
  <Frame {...p}><path d="M9 5 4 10l5 5ZM16 5l-5 5 5 5Z" /></Frame>
);
export const IconTarget = (p: IconProps) => (
  <Frame {...p}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.5" /><path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" /></Frame>
);

// Size with the text it sits beside: <IconDeath className={ICON_INLINE} />.
export const ICON_INLINE = 'inline-block h-[1em] w-[1em] align-[-0.125em]';

// Who a step is for (solo / group / raid) and what a flag step asks of you (kill, trial, ...). Both sit beside
// their label or carry an aria-label at the call site, so the glyph stays decorative.
const WHO_ICONS = { solo: IconSolo, group: IconGroup, raid: IconBlades } as const;
export function WhoIcon({ who, className = ICON_INLINE }: { who: keyof typeof WHO_ICONS; className?: string }) {
  const I = WHO_ICONS[who];
  return <I className={className} />;
}
const KIND_ICONS = {
  kill: IconBlades, trial: IconTrial, quest: IconQuest, event: IconSpark, loot: IconLoot, hail: IconHail, touch: IconTouch,
} as const;
export function KindIcon({ kind, className = ICON_INLINE }: { kind: string; className?: string }) {
  const I = KIND_ICONS[kind as keyof typeof KIND_ICONS] ?? IconSpark;
  return <I className={className} />;
}
