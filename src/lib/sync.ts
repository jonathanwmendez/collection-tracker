import "server-only";
import { selectAll } from "./paged";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORIES, categoryByName } from "./categories";
import { driveModifiedTime, getGoogleAccessToken } from "./google";
import { parseRow, photoSides, priceSource, priceSummary, todayISO, type SheetItem } from "./sheet-format";
import { getTabs, readSummarySettings, readTabs, type SummaryValues } from "./sheets";

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
  /** True when the sheet hadn't changed since the last sync, so nothing was read or written. */
  unchanged?: boolean;
};

type Existing = { id: string; category: string; name: string; sheet_row: number | null; market_value: string | number | null; last_checked: string | null; row_hash: string | null };
type ExistingPhoto = {
  id: string;
  item_id: string;
  drive_file_id: string | null;
  preview_path: string | null;
  position: number;
  side: "front" | "back" | "coa" | null;
};

// How a price was found, for the item's price history.
const METHOD_BY_SOURCE = { claude: "sheet", free: "tcgplayer", asking: "ebay_asking", hand: "manual", none: "sheet" } as const;

const CHUNK = 500;
const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/**
 * Makes the app's copy of the collection match the Google Sheet. The sheet is the source of truth:
 * rows added there (by Collection Intake, the scheduled price check, or by hand) appear in the app,
 * and rows deleted there disappear. Price changes are recorded so the app can chart them.
 */
export async function syncCollection(supabase: SupabaseClient, userId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const { data: settings } = await supabase
    .from("settings")
    .select("sheet_id, reprice_after_days, alert_change_pct, grading_cost, claude_threshold, sheet_modified_at, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  const sheetId = settings?.sheet_id as string | undefined;
  if (!sheetId) throw new SyncError("Connect your Google Sheet in Settings first.", 400);

  const token = await getGoogleAccessToken(userId);

  // Skip the whole read when the sheet hasn't changed since the last sync (large sheets take a while to read).
  const modified = await driveModifiedTime(token, sheetId).catch(() => null);
  const lastModified = settings?.sheet_modified_at ? new Date(settings.sheet_modified_at as string).toISOString() : null;
  if (!opts.force && modified && lastModified && new Date(modified).toISOString() === lastModified) {
    const { count } = await supabase.from("items").select("id", { count: "exact", head: true }).eq("user_id", userId);
    return { items: count ?? 0, added: 0, updated: 0, removed: 0, syncedAt: (settings?.last_synced_at as string) ?? new Date().toISOString(), missingTabs: [], unchanged: true };
  }
  const { tabs } = await getTabs(token, sheetId);
  const present = CATEGORIES.map((c) => c.name).filter((n) => n in tabs);
  const missingTabs = CATEGORIES.map((c) => c.name).filter((n) => !(n in tabs));
  if (present.length === 0) throw new SyncError("That sheet has none of the category tabs. Check the link in Settings.", 400);

  const [data, summary] = await Promise.all([
    readTabs(token, sheetId, present),
    "Summary" in tabs ? readSummarySettings(token, sheetId) : Promise.resolve({} as SummaryValues),
  ]);
  const sheetItems: SheetItem[] = [];
  for (const tab of present) {
    const { headers, rows } = data[tab]!;
    rows.forEach((cells, i) => {
      const item = parseRow(tab, headers, cells, i + 2);
      if (item) sheetItems.push(item);
    });
  }

  let existing: Existing[];
  try {
    existing = await selectAll<Existing>((from, to) =>
      supabase.from("items").select("id, category, name, sheet_row, market_value, last_checked, row_hash").eq("user_id", userId).order("id").range(from, to),
    );
  } catch {
    throw new SyncError("Couldn't read the app's copy of your collection.", 500);
  }

  // Match rows to items: same tab and row with the same name first, then same tab and name (rows that moved).
  const byRow = new Map(existing.map((e) => [`${e.category}#${e.sheet_row}`, e]));
  const byName = new Map<string, Existing[]>();
  for (const e of existing) byName.set(`${e.category}#${e.name}`, [...(byName.get(`${e.category}#${e.name}`) ?? []), e]);
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
    const e = (byName.get(`${s.category}#${s.name}`) ?? []).find((x) => !used.has(x.id));
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
      paid: s.paid,
      sold_price: s.soldPrice,
      sold_on: s.soldOn,
      psa9: s.psa9,
      psa10: s.psa10,
      location: s.location || null,
      catalog_id: s.catalogId || null,
      authenticator: s.authenticator || null,
      cert_number: s.certNumber || null,
    };
  });
  // Only write rows that changed since the last sync.
  const hashById = new Map(existing.map((e) => [e.id, e.row_hash]));
  const changed = upserts.map((u) => ({ ...u, row_hash: rowHash(u) })).filter((u) => hashById.get(u.id) !== u.row_hash);
  for (const part of chunks(changed)) {
    const { error } = await supabase.from("items").upsert(part, { onConflict: "id" });
    if (error) {
      console.error("Sync upsert failed", error);
      throw new SyncError("Couldn't save the synced items.", 500);
    }
  }

  const removed = existing.filter((e) => !used.has(e.id));

  // Photos: one row per Drive file linked in the Photo column, then the Back Photo column (cards).
  const photos = await selectAll<ExistingPhoto>((from, to) =>
    supabase.from("photos").select("id, item_id, drive_file_id, preview_path, position, side").eq("user_id", userId).order("id").range(from, to),
  );
  const photosByItem = new Map<string, ExistingPhoto[]>();
  for (const p of photos) photosByItem.set(p.item_id, [...(photosByItem.get(p.item_id) ?? []), p]);

  const newPhotos: Array<Record<string, unknown>> = [];
  const movedPhotos: Array<{ id: string; position: number; side: ExistingPhoto["side"] }> = [];
  const stalePhotos: ExistingPhoto[] = [];
  for (const s of sheetItems) {
    const id = idOf.get(s)!;
    const have = photosByItem.get(id) ?? [];
    const cards = Boolean(categoryByName(s.category)?.backPhoto);
    const wanted = photoSides(s.photoIds, s.backPhotoIds, cards, s.coaPhotoIds);
    wanted.forEach(({ fileId, side }, position) => {
      const found = have.find((p) => p.drive_file_id === fileId);
      if (!found) {
        newPhotos.push({
          item_id: id,
          user_id: userId,
          position,
          side,
          drive_file_id: fileId,
          drive_url: `https://drive.google.com/file/d/${fileId}/view`,
        });
      } else if (found.position !== position || found.side !== side) {
        movedPhotos.push({ id: found.id, position, side });
      }
    });
    const keep = new Set(wanted.map((w) => w.fileId));
    for (const p of have) if (!p.drive_file_id || !keep.has(p.drive_file_id)) stalePhotos.push(p);
  }
  for (const part of chunks(newPhotos)) {
    const { error } = await supabase.from("photos").insert(part);
    if (error) console.error("Insert photos failed", error);
  }
  for (const m of movedPhotos) {
    const { error } = await supabase.from("photos").update({ position: m.position, side: m.side }).eq("id", m.id);
    if (error) console.error("Update photo failed", error);
  }

  // Previews for removed photos and removed items.
  const removedIds = new Set(removed.map((r) => r.id));
  // Each photo can have a preview and a full-screen copy in Storage.
  const goneFiles = [...stalePhotos, ...photos.filter((p) => removedIds.has(p.item_id))].flatMap((p) =>
    [p.preview_path, `${userId}/${p.item_id}/${p.id}-full.jpg`].filter((x): x is string => Boolean(x)),
  );
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
      method: s.lastChecked ? METHOD_BY_SOURCE[priceSource(s.notes, s.lastChecked)] : "claude_estimate",
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
    // Settings changed on the sheet's Summary tab carry over to the app, so both stay the same.
    .update({
      last_synced_at: now,
      sheet_tabs: tabs,
      ...(modified ? { sheet_modified_at: modified } : {}),
      ...summaryUpdates(summary, settings ?? {}),
    })
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

/** A fingerprint of everything synced for a row, so unchanged rows aren't rewritten. */
function rowHash(row: Record<string, unknown>): string {
  const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== "id" && k !== "user_id"));
  return createHash("sha1").update(JSON.stringify(rest)).digest("hex");
}

/** Settings changed on the sheet's Summary tab. */
function summaryUpdates(summary: SummaryValues, current: Record<string, unknown>) {
  const out: Record<string, number | null> = {};
  const days = summary.repriceAfterDays?.value;
  if (days && days >= 1 && days !== current.reprice_after_days) out.reprice_after_days = Math.round(days);
  if (summary.alertChangePct && summary.alertChangePct.value !== (current.alert_change_pct ?? null)) {
    out.alert_change_pct = summary.alertChangePct.value === null ? null : Math.round(summary.alertChangePct.value);
  }
  const cost = summary.gradingCost?.value;
  if (summary.gradingCost && (cost ?? null) !== (current.grading_cost === null || current.grading_cost === undefined ? null : Number(current.grading_cost))) {
    out.grading_cost = cost ?? null;
  }
  const threshold = summary.claudeThreshold?.value;
  if (threshold !== undefined && threshold !== null && threshold !== Number(current.claude_threshold ?? 10)) out.claude_threshold = threshold;
  return out;
}

/** Saves today's total value, for the value-over-time chart. One snapshot per day; later syncs replace it. */
async function recordSnapshot(supabase: SupabaseClient, userId: string, all: SheetItem[]) {
  // Sold items are no longer in the collection.
  const items = all.filter((i) => i.status !== "Sold");
  const total = items.reduce((sum, i) => sum + i.quantity * (i.marketValue ?? 0), 0);
  const paid = items.reduce((sum, i) => sum + i.quantity * (i.paid ?? 0), 0);
  const byCategory: Record<string, number> = {};
  for (const i of items) byCategory[i.category] = Math.round(((byCategory[i.category] ?? 0) + i.quantity * (i.marketValue ?? 0)) * 100) / 100;
  const { error } = await supabase.from("value_snapshots").upsert(
    {
      user_id: userId,
      taken_on: todayISO(),
      total_value: Math.round(total * 100) / 100,
      items: items.length,
      pieces: items.reduce((sum, i) => sum + i.quantity, 0),
      paid: Math.round(paid * 100) / 100,
      by_category: byCategory,
    },
    { onConflict: "user_id,taken_on" },
  );
  if (error) console.error("Snapshot failed", error);
}

