import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryByName } from "./categories";
import { askingPrice, ebayConfigured } from "./ebay";
import { getGoogleAccessToken } from "./google";
import { canCheckPrice, lookupCardPrice, priceByCatalogId } from "./prices";
import { needsFreePrice } from "./reprice-rules";
import { appendNote, cellText, colIndex, COL, readHeaders, stripEstimateTag, stripPriceNotes, todayISO, valueStatusOf, type CellWrite } from "./sheet-format";
import { batchGet, writeMany } from "./sheets";

type Row = {
  id: string;
  category: string;
  name: string;
  details: Record<string, string>;
  condition: string | null;
  notes: string;
  last_checked: string | null;
  market_value: number | string | null;
  sheet_row: number | null;
  status: string;
  catalog_id: string | null;
};

export type RepriceResult = { checked: number; priced: number; skipped: number; outOfTime: boolean };

/**
 * The free morning repricing, no Claude:
 * - Magic, Pokémon, Yu-Gi-Oh!: today's market price from their card databases, every day.
 * - Sports cards: typical asking price from current eBay listings, once they're past the repricing window
 *   (only when eBay is connected).
 * Prices set by Claude's sold-price check or by hand are left for Claude's nightly run.
 */
export async function repriceFree(db: SupabaseClient, userId: string, opts: { deadline: number }): Promise<RepriceResult> {
  const { data: settings } = await db.from("settings").select("sheet_id, reprice_after_days").eq("user_id", userId).maybeSingle();
  if (!settings?.sheet_id) return { checked: 0, priced: 0, skipped: 0, outOfTime: false };
  const sheetId = settings.sheet_id as string;
  const today = todayISO();
  const cutoff = new Date(Date.now() - (Number(settings.reprice_after_days) || 30) * 86400000).toISOString().slice(0, 10);

  const { data } = await db
    .from("items")
    .select("id, category, name, details, condition, notes, last_checked, market_value, sheet_row, status, catalog_id")
    .eq("user_id", userId)
    .neq("status", "Sold")
    .order("last_checked", { ascending: true, nullsFirst: true })
    .limit(5000);
  const ebayOn = ebayConfigured();
  const rows = ((data ?? []) as Row[]).filter((r) => needsFreePrice(r, { today, cutoff, ebayOn }));
  if (!rows.length) return { checked: 0, priced: 0, skipped: 0, outOfTime: false };

  const token = await getGoogleAccessToken(userId);
  // Read each tab's headers and names once, to write by header and confirm each row is still the same item.
  const tabs = [...new Set(rows.map((r) => r.category))];
  const heads = await batchGet(token, sheetId, tabs.map((t) => `'${t.replace(/'/g, "''")}'!1:1`), "FORMATTED_VALUE");
  const names = await batchGet(token, sheetId, tabs.map((t) => `'${t.replace(/'/g, "''")}'!A:A`), "FORMATTED_VALUE");
  const headerOf = new Map(tabs.map((t, i) => [t, readHeaders(heads[i]?.[0] ?? [])]));
  const nameAt = new Map(tabs.map((t, i) => [t, (names[i] ?? []).map((cells: unknown[]) => cellText(cells?.[0]))]));

  let checked = 0;
  let priced = 0;
  let skipped = 0;
  let outOfTime = false;
  const writes: Array<CellWrite & { tab: string; row: number }> = [];
  const updates: Array<{ id: string; patch: Record<string, unknown>; check: Record<string, unknown> }> = [];

  for (const r of rows) {
    if (Date.now() > opts.deadline) {
      outOfTime = true;
      break;
    }
    const category = categoryByName(r.category);
    const headers = headerOf.get(r.category);
    if (!category || !headers) continue;
    // The sheet may have changed since the last sync: only write when the row still holds this item.
    if ((nameAt.get(r.category)?.[r.sheet_row! - 1] ?? "").toLowerCase() !== r.name.toLowerCase()) {
      skipped++;
      continue;
    }
    checked++;
    let value: number | null = null;
    let note = "";
    let method = "tcgplayer";
    try {
      if (canCheckPrice(r.category)) {
        const res = r.catalog_id
          ? await priceByCatalogId(r.catalog_id, r.details ?? {})
          : await lookupCardPrice({ category: r.category, name: r.name, details: r.details ?? {} });
        if (res.found) {
          value = res.value;
          const cond = (r.condition ?? "").trim();
          note = `Free price $${res.value} on ${today}: ${res.source}, ${res.matched}${cond && cond !== "NM" ? `, near-mint price (card is ${cond})` : ""}.`;
        }
      } else {
        const res = await askingPrice({ name: r.name, details: r.details ?? {} });
        if (res) {
          value = res.value;
          note = res.note;
          method = "ebay_asking";
        }
      }
    } catch (e) {
      console.error("Free price lookup failed", r.id, e);
    }
    if (value === null) {
      skipped++;
      continue;
    }
    priced++;
    const notes = appendNote(stripPriceNotes(stripEstimateTag(r.notes ?? "")), note);
    const put = (header: string, v: string | number) => {
      const col = colIndex(headers, header);
      if (col !== undefined) writes.push({ tab: r.category, row: r.sheet_row!, col, value: v });
    };
    put(COL.marketValue, value);
    put(COL.lastChecked, today);
    put(COL.notes, notes);
    updates.push({
      id: r.id,
      patch: { market_value: value, last_checked: today, notes, value_status: valueStatusOf(today, notes) },
      check: { item_id: r.id, user_id: userId, value, method, summary: note },
    });
  }

  // One write for the whole batch keeps the Sheets API well under its limits.
  for (let i = 0; i < writes.length; i += 300) await writeMany(token, sheetId, writes.slice(i, i + 300));
  for (const u of updates) await db.from("items").update(u.patch).eq("id", u.id);
  for (let i = 0; i < updates.length; i += 500) await db.from("price_checks").insert(updates.slice(i, i + 500).map((u) => u.check));

  return { checked, priced, skipped, outOfTime };
}
