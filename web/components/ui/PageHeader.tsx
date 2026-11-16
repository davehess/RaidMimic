// The page header pattern (docs/DESIGN-theming.md §8): eyebrow, one title, one line, actions on the right.
// The h1 takes its size, weight and colour from the html[data-ds] rules in app/globals.css, so every page that uses
// this reads as one site; with no preview on it is today's text-2xl gold.
export default function PageHeader({ eyebrow, title, lede, actions }: {
  eyebrow?: string; title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs uppercase tracking-wider text-text3">{eyebrow}</div>}
        <h1 className="text-2xl text-title">{title}</h1>
        {lede && <p className="mt-1 max-w-prose text-sm text-text2">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
