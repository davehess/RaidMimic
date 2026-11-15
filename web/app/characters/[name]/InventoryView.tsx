// A character's uploaded gear and bags on its Raid Mimic page: one block per uploaded file kind, newest open, items grouped
// worn / bags / bank / shared bank by the same slot rule the Wolf Pack inventory page uses (web/lib/inventoryAggregate.ts
// locGroup, pure). Item names and slots are player-supplied text and render as plain text. Icons are the shipped atlas,
// looked up by item id from the public item catalog by the page.
import { ItemIcon } from '@/components/ItemIcon';
import { locGroup } from '@/lib/inventoryAggregate';
import type { StoredInventory, StoredItem } from '@/lib/hubInventoryDb';

const GROUPS: { key: string; title: string }[] = [
  { key: 'equipped', title: 'Worn' }, { key: 'bags', title: 'In bags' }, { key: 'bank', title: 'Bank' }, { key: 'shared', title: 'Shared bank' },
];
const SOURCE_NAME = { inventory: 'Inventory file', quarmy: 'Quarmy export' } as const;

function Row({ it, icons }: { it: StoredItem; icons: Record<number, number | null> }) {
  return (
    <li className="flex items-center gap-2">
      <span className="inline-flex w-6 shrink-0 justify-center">
        <ItemIcon icon={it.item_id ? icons[it.item_id] : null} size={20} name={it.item_name} />
      </span>
      <span className="min-w-0 flex-1 break-words text-text">{it.item_name}{it.quantity > 1 ? <span className="text-dim"> x{it.quantity}</span> : null}</span>
      <span className="shrink-0 text-xs text-dim">{it.slot_label}</span>
    </li>
  );
}

export default function InventoryView({ sets, icons }: { sets: StoredInventory; icons: Record<number, number | null> }) {
  return (
    <div className="space-y-3">
      {sets.map((s, i) => (
        <details key={s.source} open={i === 0} className="rounded-lg border border-border bg-panel p-4">
          <summary className="cursor-pointer text-sm text-blue">
            {SOURCE_NAME[s.source]} · {s.items.length} item{s.items.length === 1 ? '' : 's'} · uploaded {s.observedAt.slice(0, 10)}
          </summary>
          {GROUPS.map(g => {
            const items = s.items.filter(it => locGroup(it.slot_label) === g.key);
            if (items.length === 0) return null;
            return (
              <div key={g.key} className="mt-3">
                <h3 className="text-xs uppercase tracking-wider text-dim">{g.title} ({items.length})</h3>
                <ul className="mt-1 space-y-1 text-sm">{items.map(it => <Row key={it.slot_label} it={it} icons={icons} />)}</ul>
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
