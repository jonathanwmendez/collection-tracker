import "server-only";
import { toItem, type Item } from "./collection";
import { coversCategory, isExpired, looksLikeToken, type Share } from "./share-rules";
import { createAdminClient } from "./supabase/admin";
import { selectAll } from "./paged";

const SHARE_ITEM_COLUMNS =
  "id, category, name, details, condition, quantity, market_value, value_status, last_checked, status, notes, sheet_row, updated_at, photos(id, position, drive_url, side)";

/** The share for a link's token, or null when it doesn't exist, was turned off, or has expired. */
export async function getShare(token: string): Promise<Share | null> {
  if (!looksLikeToken(token)) return null;
  const { data } = await createAdminClient().from("shares").select("*").eq("token", token).maybeSingle();
  if (!data || isExpired(data as Share)) return null;
  return data as Share;
}

/** Removes what the link hides: values, notes, and Drive links (viewers can't open those anyway). */
function redact(item: Item, share: Share): Item {
  return {
    ...item,
    market_value: share.show_values ? item.market_value : null,
    notes: share.show_notes ? item.notes : "",
    photos: item.photos.map((p) => ({ ...p, drive_url: null })),
  };
}

export async function getSharedItems(share: Share): Promise<Item[]> {
  // Sold items are no longer in the collection.
  const rows = await selectAll<Record<string, unknown>>((from, to) => {
    let q = createAdminClient().from("items").select(SHARE_ITEM_COLUMNS).eq("user_id", share.user_id).neq("status", "Sold");
    if (share.categories?.length) q = q.in("category", share.categories);
    return q.order("category").order("sheet_row", { ascending: true }).order("id").range(from, to);
  });
  return rows.map((r) => redact(toItem(r), share));
}

export async function getSharedItem(share: Share, id: string): Promise<Item | null> {
  const { data } = await createAdminClient()
    .from("items")
    .select(SHARE_ITEM_COLUMNS)
    .eq("user_id", share.user_id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const item = toItem(data as Record<string, unknown>);
  return coversCategory(share, item.category) ? redact(item, share) : null;
}

/** Counts a view. Best effort: a failed count never blocks the page. */
export async function countView(share: Share) {
  await createAdminClient()
    .from("shares")
    .update({ view_count: share.view_count + 1, last_viewed_at: new Date().toISOString() })
    .eq("id", share.id);
}

/** The owner's first name, for the page title when the link has none. */
export async function ownerFirstName(userId: string): Promise<string> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  const full = (data.user?.user_metadata?.full_name as string | undefined) ?? "";
  return full.split(/\s+/)[0] ?? "";
}
