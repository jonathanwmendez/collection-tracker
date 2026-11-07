import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES } from "./categories";
import { getGoogleAccessToken } from "./google";
import { parseRow, priceSummary, todayISO, type SheetItem } from "./sheet-format";
import { getTabs, readTabs } from "./sheets";

export class SyncError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type SyncResult = {
  items: number;
  added: number;
  updated: number;
  removed: number;
  syncedAt: string;
  missingTabs: string[];
};

type Existing = { id: string; category: string; name: string; sheet_row: number | null; market_value: string | number | null; last_checked: string | null };
type ExistingPhoto = { id: string; item_id: string; drive_file_id: string | null; preview_path: string | null };

const CHUNK = 500;
const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Makes the app's copy of the collection match the Google Sheet. The sheet is the source of truth:
 * rows added there (by Collection Intake, the scheduled price check, or by hand) appear in the app,
 * and rows deleted there disappear. Price changes are recorded so the app can chart them.
 */
export async function syncCollection(supabase: SupabaseClient, userId: string): Promise<SyncResult> {
  const { data: settings } = await supabase.from("settings").select("sheet_id").eq("user_id", userId).maybeSingle();
  const sheetId = settings?.sheet_id as string | undefined;
  if (!sheetId) throw new SyncError("Connect your Google Sheet in Settings first.", 400);

  const token = await getGoogleAccessToken(userId);
  const { tabs } = await getTabs(token, sheetId);
  const present = CATEGORIES.map((c) => c.name).filter((n) => n in tabs);
  const missingTabs = CATEGORIES.map((c) => c.name).filter((n) => !(n in tabs));
  if (present.length === 0) throw new SyncError("That sheet has none of the category tabs. Check the link in Settings.", 400);

  const data = await readTabs(token, sheetId, present);
  const sheetItems: SheetItem[] = [];
  for (const tab of present) {
    const { headers, rows } = data[tab]!;
    rows.forEach((cells, i) => {
      const item = parseRow(tab, headers, cells, i + 2);
      if (item) sheetItems.push(item);
    });
  }

  const { data: existingRows, error: exErr } = await supabase
    .from("items")
    .select("id, category, name, sheet_row, market_value, last_checked")
    .eq("user_id", userId);
  if (exErr) throw new SyncError("Couldn't read the app's copy of your collection.", 500);
  const existing = (existingRows ?? []) as Existing[];

  // Match rows to items: same tab and row with the same name first, then same tab and name (rows that moved).
  const byRow = new Map(existing.map((e) => [`${e.category}#${e.sheet_row}`, e]));
  const used = new Set<string>();
  const matched = new Map<SheetItem, Existing>();
  for (const s of sheetItems) {
    const e = byRow.get(`${s.category}#${s.row}`);
    if (e && e.name === s.name && !used.has(e.id)) {
      matched.set(s, e);
      used.add(e.id);
    }
  }
  for (const s of sheetItems) {
    if (matched.has(s)) continue;
    const e = existing.find((x) => !used.has(x.id) && x.category === s.category && x.name === s.name);
    if (e) {
      matched.set(s, e);
      used.add(e.id);
    }
  }

  const idOf = new Map<SheetItem, string>();
  const upserts = sheetItems.map((s) => {
    const id = matched.get(s)?.id ?? crypto.randomUUID();
    idOf.set(s, id);
    return {
      id,
      user_id: userId,
      category: s.category,
      name: s.name,
      details: s.details,
      condition: s.condition,
      quantity: s.quantity,
      market_value: s.marketValue,
      value_status: s.valueStatus,
      last_checked: s.lastChecked,
      status: s.status,
      notes: s.notes,
      sheet_row: s.row,
    };
  });
  for (const part of chunks(upserts)) {
    const { error } = await supabase.from("items").upsert(part, { onConflict: "id" });
    if (error) {
      console.error("Sync upsert failed", error);
      throw new SyncError("Couldn't save the synced items.", 500);
    }
  }

  const removed = existing.filter((e) => !used.has(e.id));

  // Photos: one row per Drive file linked in the Photo column.
  const { data: photoRows } = await supabase.from("photos").select("id, item_id, drive_file_id, preview_path").eq("user_id", userId);
  const photos = (photoRows ?? []) as ExistingPhoto[];
  const photosByItem = new Map<string, ExistingPhoto[]>();
  for (const p of photos) photosByItem.set(p.item_id, [...(photosByItem.get(p.item_id) ?? []), p]);

  const newPhotos: Array<Record<string, unknown>> = [];
  const stalePhotos: ExistingPhoto[] = [];
  for (const s of sheetItems) {
    const id = idOf.get(s)!;
    const have = photosByItem.get(id) ?? [];
    s.photoIds.forEach((fileId, position) => {
      if (!have.some((p) => p.drive_file_id === fileId)) {
        newPhotos.push({
          item_id: id,
          user_id: userId,
          position,
          drive_file_id: fileId,
          drive_url: `https://drive.google.com/file/d/${fileId}/view`,
        });
      }
    });
    for (const p of have) if (!p.drive_file_id || !s.photoIds.includes(p.drive_file_id)) stalePhotos.push(p);
  }
  for (const part of chunks(newPhotos)) {
    const { error } = await supabase.from("photos").insert(part);
    if (error) console.error("Insert photos failed", error);
  }

  // Previews for removed photos and removed items.
  const removedIds = new Set(removed.map((r) => r.id));
  const goneFiles = [...stalePhotos, ...photos.filter((p) => removedIds.has(p.item_id))]
    .map((p) => p.preview_path)
    .filter((p): p is string => Boolean(p));
  if (goneFiles.length) await supabase.storage.from("previews").remove(goneFiles);
  for (const part of chunks(stalePhotos.map((p) => p.id))) await supabase.from("photos").delete().in("id", part);
  for (const part of chunks([...removedIds])) await supabase.from("items").delete().in("id", part);

  // Price history: record new items' values and any value or check date that changed.
  const now = new Date().toISOString();
  const checks = sheetItems
    .filter((s) => s.marketValue !== null)
    .filter((s) => {
      const e = matched.get(s);
      if (!e) return true;
      const before = e.market_value === null ? null : Number(e.market_value);
      return before !== s.marketValue || (e.last_checked ?? null) !== s.lastChecked;
    })
    .map((s) => ({
      item_id: idOf.get(s)!,
      user_id: userId,
      value: s.marketValue,
      method: s.lastChecked ? "sheet" : "claude_estimate",
      checked_at: s.lastChecked && !matched.get(s) ? `${s.lastChecked}T17:00:00Z` : now,
      summary: priceSummary(s.notes, s.valueStatus),
    }));
  for (const part of chunks(checks)) {
    const { error } = await supabase.from("price_checks").insert(part);
    if (error) console.error("Insert price checks failed", error);
  }

  await recordSnapshot(supabase, userId, sheetItems);

  const { error: setErr } = await supabase
    .from("settings")
    .update({ last_synced_at: now, sheet_tabs: tabs })
    .eq("user_id", userId);
  if (setErr) console.error("Couldn't save sync time", setErr);

  return {
    items: sheetItems.length,
    added: sheetItems.length - matched.size,
    updated: matched.size,
    removed: removed.length,
    syncedAt: now,
    missingTabs,
  };
}

/** Saves today's total value, for the value-over-time chart. One snapshot per day; later syncs replace it. */
async function recordSnapshot(
  supabase: SupabaseClient,
  userId: string,
  items: Array<{ quantity: number; marketValue: number | null }>,
) {
  const total = items.reduce((sum, i) => sum + i.quantity * (i.marketValue ?? 0), 0);
  const { error } = await supabase.from("value_snapshots").upsert(
    {
      user_id: userId,
      taken_on: todayISO(),
      total_value: Math.round(total * 100) / 100,
      items: items.length,
      pieces: items.reduce((sum, i) => sum + i.quantity, 0),
    },
    { onConflict: "user_id,taken_on" },
  );
  if (error) console.error("Snapshot failed", error);
}
