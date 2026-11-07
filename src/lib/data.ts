import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toItem, type Item } from "./collection";

export { staleCutoff } from "./collection";

export type Settings = {
  sheet_id: string | null;
  intake_url: string | null;
  sheet_tabs: Record<string, number>;
  last_synced_at: string | null;
  reprice_after_days: number;
  alert_change_pct: number | null;
  grading_cost: number;
};

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase
    .from("settings")
    .select("sheet_id, intake_url, sheet_tabs, last_synced_at, reprice_after_days, alert_change_pct, grading_cost")
    .maybeSingle();
  return {
    sheet_id: data?.sheet_id ?? null,
    intake_url: data?.intake_url ?? null,
    sheet_tabs: (data?.sheet_tabs ?? {}) as Record<string, number>,
    last_synced_at: data?.last_synced_at ?? null,
    reprice_after_days: data?.reprice_after_days ?? 30,
    alert_change_pct: data?.alert_change_pct ?? null,
    grading_cost: data?.grading_cost === null || data?.grading_cost === undefined ? 30 : Number(data.grading_cost),
  };
}

const ITEM_COLUMNS =
  "id, category, name, details, condition, quantity, market_value, value_status, last_checked, status, notes, sheet_row, updated_at, paid, sold_price, sold_on, psa9, psa10, photos(id, position, drive_url)";

export async function getItems(supabase: SupabaseClient, category?: string): Promise<Item[]> {
  let q = supabase.from("items").select(ITEM_COLUMNS).order("sheet_row", { ascending: true });
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) console.error("Load items failed", error);
  return (data ?? []).map((r) => toItem(r as Record<string, unknown>));
}

export type PriceCheck = { id: string; checked_at: string; value: number | null; method: string; summary: string };

export async function getItem(supabase: SupabaseClient, id: string): Promise<{ item: Item; history: PriceCheck[] } | null> {
  const [{ data }, { data: history }] = await Promise.all([
    supabase.from("items").select(ITEM_COLUMNS).eq("id", id).maybeSingle(),
    supabase
      .from("price_checks")
      .select("id, checked_at, value, method, summary")
      .eq("item_id", id)
      .order("checked_at", { ascending: false })
      .limit(50),
  ]);
  if (!data) return null;
  return {
    item: toItem(data as Record<string, unknown>),
    history: (history ?? []).map((h) => ({ ...h, value: h.value === null ? null : Number(h.value) })) as PriceCheck[],
  };
}

export type Snapshot = { taken_on: string; total_value: number; paid: number | null; by_category: Record<string, number> };

export async function getSnapshots(supabase: SupabaseClient): Promise<Snapshot[]> {
  const { data } = await supabase
    .from("value_snapshots")
    .select("taken_on, total_value, paid, by_category")
    .order("taken_on", { ascending: true })
    .limit(730);
  return (data ?? []).map((s) => ({
    taken_on: s.taken_on as string,
    total_value: Number(s.total_value),
    paid: s.paid === null ? null : Number(s.paid),
    by_category: (s.by_category ?? {}) as Record<string, number>,
  }));
}

export type Move = { id: string; name: string; category: string; from: number; to: number; change: number; pct: number; on: string };

/**
 * Each item's latest value change, from its price history: the newest check compared with the check
 * before it that had a different value. Biggest moves in dollars first.
 */
export async function getMovers(supabase: SupabaseClient, items: Item[], sinceDays = 90): Promise<Move[]> {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const { data } = await supabase
    .from("price_checks")
    .select("item_id, value, checked_at")
    .gte("checked_at", since)
    .order("checked_at", { ascending: false })
    .limit(5000);
  const byItem = new Map<string, Array<{ value: number; at: string }>>();
  for (const r of data ?? []) {
    if (r.value === null) continue;
    const list = byItem.get(r.item_id as string) ?? [];
    list.push({ value: Number(r.value), at: r.checked_at as string });
    byItem.set(r.item_id as string, list);
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
