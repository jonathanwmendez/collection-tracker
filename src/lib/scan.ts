import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryByName, nameField } from "./categories";
import { findDuplicate } from "./duplicates";
import { createDriveFolder, driveFolderExists, getGoogleAccessToken } from "./google";
import { cellText, colIndex, COL, itemCells, todayISO, valueStatusOf } from "./sheet-format";
import { nextEmptyRow, readRow, writeCells } from "./sheets";
import type { Candidate } from "./identify";

export class ScanError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * The Drive folder for a category's scans: "Collection Tracker Scans/<category>", created by the app
 * (so it only needs permission for files it creates). Folder IDs are kept in settings.
 */
export async function scanFolder(supabase: SupabaseClient, userId: string, token: string, category: string): Promise<string> {
  const { data } = await supabase.from("settings").select("scan_folders").eq("user_id", userId).maybeSingle();
  const folders = { ...((data?.scan_folders ?? {}) as Record<string, string>) };
  let changed = false;
  if (!folders.root || !(await driveFolderExists(token, folders.root))) {
    folders.root = await createDriveFolder(token, "Collection Tracker Scans");
    for (const k of Object.keys(folders)) if (k !== "root") delete folders[k];
    changed = true;
  }
  if (!folders[category]) {
    folders[category] = await createDriveFolder(token, category, folders.root);
    changed = true;
  }
  if (changed) await supabase.from("settings").update({ scan_folders: folders }).eq("user_id", userId);
  return folders[category]!;
}

export type SaveInput = {
  candidate: Candidate;
  condition: string;
  location: string;
  photos: { front?: { id: string; url: string }; back?: { id: string; url: string }; coa?: { id: string; url: string } };
  authenticator: string;
  certNumber: string;
  /** Extra price from current listings (sports cards), when there is one. */
  asking?: { value: number; note: string } | null;
};

export type SaveResult = { itemId: string; row: number; merged: boolean; quantity: number };

/**
 * Saves a scanned item: adds 1 to an item you already have, or writes a new row to the sheet and the app.
 * Rows that couldn't be identified are tagged "[Needs identifying]" for the nightly run.
 */
export async function saveScan(supabase: SupabaseClient, userId: string, input: SaveInput): Promise<SaveResult> {
  const c = input.candidate;
  const category = categoryByName(c.category);
  if (!category) throw new ScanError("Unknown category.");
  const { data: settings } = await supabase.from("settings").select("sheet_id").eq("user_id", userId).maybeSingle();
  if (!settings?.sheet_id) throw new ScanError("Connect your Google Sheet in Settings first.");
  const sheetId = settings.sheet_id as string;
  const token = await getGoogleAccessToken(userId);
  const condition = (input.condition || c.condition || "").slice(0, 60);
  const unidentified = c.name.startsWith("Unidentified");

  // Already have it? Add 1 to its quantity instead of a new row (only when it was identified).
  const dup = unidentified ? null : await findDuplicate(supabase, { category: category.name, name: c.name, details: c.details, condition, catalogId: c.catalogId });
  if (dup?.row) {
    const { headers, cells: values } = await readRow(token, sheetId, category.name, dup.row);
    const nameCol = colIndex(headers, nameField(category));
    const qtyCol = colIndex(headers, COL.quantity);
    if (nameCol !== undefined && qtyCol !== undefined && cellText(values[nameCol]).toLowerCase() === c.name.toLowerCase()) {
      const quantity = Math.max(1, Number(values[qtyCol]) || 1) + 1;
      await writeCells(token, sheetId, category.name, dup.row, [{ col: qtyCol, value: quantity }]);
      await supabase.from("items").update({ quantity }).eq("id", dup.id);
      return { itemId: dup.id, row: dup.row, merged: true, quantity };
    }
  }

  const today = todayISO();
  const price = c.price
    ? { value: c.price.value, note: `Free price $${c.price.value} on ${today}: ${c.price.source} (${c.price.matched}).` }
    : input.asking ?? null;
  const notes = [
    unidentified ? "[Needs identifying]" : "",
    "Added by the Scan page.",
    c.problem ? `Check this: ${c.problem}.` : "",
    price?.note ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const { headers } = await readRow(token, sheetId, category.name, 1);
  if (headers.size === 0) throw new ScanError(`Your sheet has no "${category.name}" tab.`);
  const row = await nextEmptyRow(token, sheetId, category.name);
  const cells = itemCells(category, headers, {
    name: c.name,
    details: c.details,
    condition,
    quantity: 1,
    status: "Keep",
    notes,
    location: input.location,
    catalogId: c.catalogId,
    authenticator: input.authenticator || c.authenticator || "",
    certNumber: input.certNumber || c.certNumber || "",
    photoUrl: input.photos.front?.url,
    backPhotoUrl: category.backPhoto ? input.photos.back?.url : undefined,
    coaPhotoUrl: input.photos.coa?.url,
    ...(price ? { marketValue: price.value, lastChecked: today } : {}),
  });
  await writeCells(token, sheetId, category.name, row, cells);

  // Show it in the app right away; the next sync matches it by tab, row, and name.
  const itemId = crypto.randomUUID();
  const lastChecked = price ? today : null;
  const { error } = await supabase.from("items").insert({
    id: itemId,
    user_id: userId,
    category: category.name,
    name: c.name,
    details: Object.fromEntries(category.fields.slice(1).map((f) => [f, c.details[f] ?? ""])),
    condition,
    quantity: 1,
    market_value: price?.value ?? null,
    value_status: valueStatusOf(lastChecked, notes),
    last_checked: lastChecked,
    status: "Keep",
    notes,
    sheet_row: row,
    location: input.location || null,
    catalog_id: c.catalogId || null,
    authenticator: input.authenticator || c.authenticator || null,
    cert_number: input.certNumber || c.certNumber || null,
  });
  if (error) console.error("Insert scanned item failed", error);
  else {
    const photos = [
      input.photos.front && { side: category.backPhoto ? "front" : null, ...input.photos.front },
      category.backPhoto && input.photos.back && { side: "back", ...input.photos.back },
      input.photos.coa && { side: "coa", ...input.photos.coa },
    ].filter(Boolean) as Array<{ side: string | null; id: string; url: string }>;
    if (photos.length) {
      await supabase.from("photos").insert(
        photos.map((p, position) => ({ item_id: itemId, user_id: userId, position, side: p.side, drive_file_id: p.id, drive_url: p.url })),
      );
    }
    if (price) {
      await supabase.from("price_checks").insert({
        item_id: itemId,
        user_id: userId,
        value: price.value,
        method: c.price ? "tcgplayer" : "ebay_asking",
        summary: price.note,
      });
    }
  }
  return { itemId, row, merged: false, quantity: 1 };
}
