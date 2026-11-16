// A minimal table: sticky-free, tabular numbers, numeric columns right-aligned, and its own horizontal scroller so a
// wide table never makes the PAGE scroll sideways at phone width. Cells render through `render` when a column needs more
// than text (a chip, a bar); everything else prints the row's value.
export type Column<T> = {
  key: string; label: string; numeric?: boolean; render?: (row: T) => React.ReactNode; className?: string;
};

export default function DataTable<T>({ columns, rows, rowKey, caption }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; caption?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-max border-collapse text-sm tabular-nums">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-raised text-xs text-text2">
            {columns.map(c => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.numeric ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={rowKey(r)} className="border-t border-border bg-panel hover:bg-raised">
              {columns.map(c => (
                <td key={c.key} className={`px-3 py-2 ${c.numeric ? 'text-right' : 'text-left'} ${c.className ?? ''}`}>
                  {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
