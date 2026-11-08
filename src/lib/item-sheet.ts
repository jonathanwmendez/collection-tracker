import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryByName, nameField, type Category } from "./categories";
import { getGoogleAccessToken } from "./google";
import { cellText, colIndex, type Headers } from "./sheet-format";
import { readRow } from "./sheets";

export class ItemError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type ItemRecord = {
  id: string;
  category: string;
  name: string;
  details: Record<string, string>;
  condition: string | null;
  quantity: number;
  market_value: string | number | null;
  value_status: "estimate" | "verified" | "unverifiable" | "asking";
  last_checked: string | null;
  status: string;
  notes: string;
  sheet_row: number | null;
};

export type ItemContext = {
  item: ItemRecord;
  category: Category;
  sheetId: string;
  tabs: Record<string, number>;
  token: string;
};

/** Loads an item plus what's needed to change its row in the sheet. */
export async function itemContext(supabase: SupabaseClient, userId: string, itemId: string): Promise<ItemContext> {
  const [{ data: item }, { data: settings }] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).maybeSingle(),
    supabase.from("settings").select("sheet_id, sheet_tabs").eq("user_id", userId).maybeSingle(),
  ]);
  if (!item) throw new ItemError("That item wasn't found. It may have been removed from the sheet.", 404);
  const category = categoryByName(item.category);
  if (!category) throw new ItemError("Unknown category.", 400);
  if (!settings?.sheet_id) throw new ItemError("Connect your Google Sheet in Settings first.", 400);
  if (!item.sheet_row) throw new ItemError("This item isn't linked to a sheet row yet. Sync and try again.", 409);
  const token = await getGoogleAccessToken(userId);
  return {
    item: item as ItemRecord,
    category,
    sheetId: settings.sheet_id,
    tabs: (settings.sheet_tabs ?? {}) as Record<string, number>,
    token,
  };
}

/**
 * Reads the item's row and checks it still holds this item. Rows shift when someone sorts or deletes
 * in the sheet, and writing to the wrong row would overwrite a different item.
 */
export async function verifiedRow(ctx: ItemContext): Promise<{ headers: Headers; cells: unknown[] }> {
  const { headers, cells } = await readRow(ctx.token, ctx.sheetId, ctx.category.name, ctx.item.sheet_row!);
  const col = colIndex(headers, nameField(ctx.category));
  const inSheet = col === undefined ? "" : cellText(cells[col]);
  if (inSheet !== ctx.item.name) {
    throw new ItemError("The sheet changed since the last sync, so this row now holds something else. Sync and try again.", 409);
  }
  return { headers, cells };
}
