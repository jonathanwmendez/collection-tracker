import type { Item } from "./collection";

export type Move = { id: string; name: string; category: string; from: number; to: number; change: number; pct: number; on: string };
export type Check = { item_id: string; value: number | null; checked_at: string };

/**
 * Each item's latest value change: the newest check compared with the check before it that had a
 * different value. Sold items are left out. Biggest moves in dollars first.
 */
export function computeMovers(checks: Check[], items: Item[]): Move[] {
  const byItem = new Map<string, Array<{ value: number; at: string }>>();
  for (const r of [...checks].sort((a, b) => b.checked_at.localeCompare(a.checked_at))) {
    if (r.value === null) continue;
    const list = byItem.get(r.item_id) ?? [];
    list.push({ value: r.value, at: r.checked_at });
    byItem.set(r.item_id, list);
  }
  const moves: Move[] = [];
  for (const i of items) {
    if (i.status === "Sold") continue;
    const list = byItem.get(i.id);
    if (!list || list.length < 2) continue;
    const latest = list[0]!;
    const before = list.find((c) => c.value !== latest.value);
    if (!before || before.value === 0) continue;
    const change = i.quantity * (latest.value - before.value);
    moves.push({
      id: i.id,
      name: i.name,
      category: i.category,
      from: before.value,
      to: latest.value,
      change,
      pct: ((latest.value - before.value) / before.value) * 100,
      on: latest.at,
    });
  }
  return moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}
