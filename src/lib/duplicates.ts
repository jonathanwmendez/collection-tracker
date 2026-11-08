import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export type Duplicate = { id: string; row: number | null; quantity: number };

/**
 * An item you still own that's the same thing: the same card database ID and condition, or the same name,
 * the same filled-in details, and the same condition.
 */
export async function findDuplicate(
  supabase: SupabaseClient,
  item: { category: string; name: string; details: Record<string, string>; condition: string; catalogId?: string },
): Promise<Duplicate | null> {
  if (item.catalogId) {
    const { data } = await supabase
      .from("items")
      .select("id, condition, quantity, sheet_row, status")
      .eq("category", item.category)
      .eq("catalog_id", item.catalogId);
    const hit = (data ?? []).find((r) => r.status !== "Sold" && (!norm(r.condition) || !norm(item.condition) || norm(r.condition) === norm(item.condition)));
    if (hit) return { id: hit.id as string, row: hit.sheet_row as number | null, quantity: hit.quantity as number };
  }
  const { data } = await supabase
    .from("items")
    .select("id, name, details, condition, quantity, sheet_row, status")
    .eq("category", item.category)
    .ilike("name", item.name.replace(/[%_\\]/g, (c) => "\\" + c));
  for (const r of data ?? []) {
    if (r.status === "Sold" || norm(r.name) !== norm(item.name)) continue;
    const theirs = (r.details ?? {}) as Record<string, string>;
    const same = Object.entries(item.details).every(([k, v]) => !norm(v) || !norm(theirs[k]) || norm(v) === norm(theirs[k]));
    if (!same) continue;
    if (norm(r.condition) && norm(item.condition) && norm(r.condition) !== norm(item.condition)) continue;
    return { id: r.id as string, row: r.sheet_row as number | null, quantity: r.quantity as number };
  }
  return null;
}
