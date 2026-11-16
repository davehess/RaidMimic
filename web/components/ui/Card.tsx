// A surface: panel ground, hairline border, one heading style. `as` lets a list use <li> or <section> without a wrapper div.
export default function Card({ title, actions, children, as: Tag = 'section', className = '' }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
  as?: 'section' | 'div' | 'li' | 'article'; className?: string;
}) {
  return (
    <Tag className={`rounded-lg border border-border bg-panel p-4 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-text">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
