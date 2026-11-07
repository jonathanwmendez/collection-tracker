import Link from "next/link";
import { isStale, itemTotal, subtitle, type Item } from "@/lib/collection";
import { money } from "@/lib/format";
import { ItemThumb } from "./item-thumb";
import { StatusBadge, ValueBadge } from "./value-badge";

/** Changes for share links: where rows go, where photos come from, and whether values show. */
export type RowView = { href: (id: string) => string; photo: (photoId: string) => string; values: boolean; badges: boolean };

export function ItemRow({
  item,
  repriceDays,
  showCategory,
  view,
}: {
  item: Item;
  repriceDays: number;
  showCategory?: boolean;
  view?: RowView;
}) {
  const sub = subtitle(item);
  const values = view?.values ?? true;
  const photo = item.photos[0];
  return (
    <li>
      <Link
        href={view ? view.href(item.id) : `/items/${item.id}`}
        className="flex items-center gap-3 px-3 py-3 text-ink no-underline hover:bg-bg focus-visible:bg-bg rounded-xl"
      >
        <ItemThumb photo={photo} name={item.name} src={photo && view ? view.photo(photo.id) : undefined} />
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <span className="font-medium leading-snug truncate">{item.name}</span>
          <span className="text-xs text-muted truncate">
            {[showCategory ? item.category : "", sub, item.condition ?? ""].filter(Boolean).join(" · ")}
          </span>
          {(view?.badges ?? true) && (
            <span className="flex flex-wrap gap-1 mt-0.5">
              <ValueBadge status={item.value_status} stale={isStale(item, repriceDays)} />
              <StatusBadge status={item.status} />
            </span>
          )}
        </div>
        {values && (
          <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
            <span className="font-mono text-sm tabular-nums">{item.market_value === null ? "No value" : money(itemTotal(item))}</span>
            {item.quantity > 1 && item.market_value !== null && (
              <span className="text-[11px] text-muted font-mono tabular-nums">
                {item.quantity} × {money(item.market_value)}
              </span>
            )}
          </div>
        )}
        {!values && item.quantity > 1 && <span className="text-xs text-muted shrink-0">×{item.quantity}</span>}
      </Link>
    </li>
  );
}

export function ItemList({
  items,
  repriceDays,
  showCategory,
  view,
}: {
  items: Item[];
  repriceDays: number;
  showCategory?: boolean;
  view?: RowView;
}) {
  return (
    <ul className="rounded-2xl border border-line bg-surface p-1 flex flex-col divide-y divide-line">
      {items.map((i) => (
        <ItemRow key={i.id} item={i} repriceDays={repriceDays} showCategory={showCategory} view={view} />
      ))}
    </ul>
  );
}
