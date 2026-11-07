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
};

export async function getSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase
    .from("settings")
    .select("sheet_id, intake_url, sheet_tabs, last_synced_at, reprice_after_days")
    .maybeSingle();
  return {
    sheet_id: data?.sheet_id ?? null,
    intake_url: data?.intake_url ?? null,
    sheet_tabs: (data?.sheet_tabs ?? {}) as Record<string, number>,
    last_synced_at: data?.last_synced_at ?? null,
    reprice_after_days: data?.reprice_after_days ?? 90,
  };
}

const ITEM_COLUMNS =
  "id, category, name, details, condition, quantity, market_value, value_status, last_checked, status, notes, sheet_row, updated_at, photos(id, position, drive_url)";

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

export async function getSnapshots(supabase: SupabaseClient): Promise<Array<{ taken_on: string; total_value: number }>> {
  const { data } = await supabase
    .from("value_snapshots")
    .select("taken_on, total_value")
    .order("taken_on", { ascending: true })
    .limit(730);
  return (data ?? []).map((s) => ({ taken_on: s.taken_on as string, total_value: Number(s.total_value) }));
}
