// Reading and writing the Collection Tracker sheet's rows. Pure functions, so they can be tested without Google.
//
// Each category tab has the category's fields, then Condition, Qty, Market Value (Each), Total Value (Auto),
// Last Checked, a price link (Auto), Status, Photo, and Notes (card tabs also have Back Photo). Columns are found by header name, so the
// app keeps working if columns move. "(Auto)" columns hold formulas and are never written.

import { categoryByName, nameField, STATUSES, type Category, type Status } from "./categories";

export const COL = {
  condition: "Condition",
  quantity: "Qty",
  marketValue: "Market Value (Each)",
  lastChecked: "Last Checked",
  status: "Status",
  photo: "Photo",
  backPhoto: "Back Photo",
  notes: "Notes",
  paid: "Paid (Each)",
  soldPrice: "Sold For (Each)",
  soldDate: "Sold Date",
  psa9: "PSA 9 (Each)",
  psa10: "PSA 10 (Each)",
  location: "Location",
  catalogId: "Catalog ID",
  authenticator: "Authenticator",
  certNumber: "Cert Number",
  coaPhoto: "COA Photo",
} as const;

export type ValueStatus = "estimate" | "verified" | "unverifiable" | "asking";
/** Where the current price came from, read from the latest price sentence in Notes. */
export type PriceSource = "claude" | "free" | "asking" | "hand" | "none";

export type SheetItem = {
  row: number;
  category: string;
  name: string;
  /** Every field except the name, keyed by header (e.g. Year, Set, Grade). */
  details: Record<string, string>;
  condition: string;
  quantity: number;
  marketValue: number | null;
  /** YYYY-MM-DD, or null when the price hasn't been checked yet. */
  lastChecked: string | null;
  status: Status;
  notes: string;
  photoIds: string[];
  /** Cards only: Drive file IDs in the Back Photo column. */
  backPhotoIds: string[];
  valueStatus: ValueStatus;
  /** What you paid for one, what one sold for, and when (owner's columns). */
  paid: number | null;
  soldPrice: number | null;
  soldOn: string | null;
  /** Graded prices for one ungraded card, found by the price check. */
  psa9: number | null;
  psa10: number | null;
  /** Where it's kept (box, binder), its ID in a card database, and its certificate of authenticity. */
  location: string;
  catalogId: string;
  authenticator: string;
  certNumber: string;
  coaPhotoIds: string[];
};

/** Header name (lowercased) to column index. */
export type Headers = Map<string, number>;

export function readHeaders(row: unknown[]): Headers {
  const map: Headers = new Map();
  row.forEach((v, i) => {
    const key = String(v ?? "").trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

export function colIndex(headers: Headers, name: string): number | undefined {
  const key = name.toLowerCase();
  if (headers.has(key)) return headers.get(key);
  // Tolerate small header changes, like "Market Value" without "(Each)".
  const base = key.replace(/\s*\(.*\)\s*$/, "");
  for (const [h, i] of headers) if (h.replace(/\s*\(.*\)\s*$/, "") === base) return i;
  return undefined;
}

/** A1 column letters for a zero-based index: 0 → A, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** The text a cell shows. For =HYPERLINK("url","label") that's the label. */
export function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const s = String(v);
  const link = s.match(/^=\s*HYPERLINK\(\s*"[^"]*"\s*,\s*"([^"]*)"\s*\)\s*$/i);
  if (link) return link[1]!;
  return s.trim();
}

export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Google Sheets date serial (days since 1899-12-30) to YYYY-MM-DD. */
export function serialToISO(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return serialToISO(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseQuantity(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(100000, Math.round(n)) : 1;
}

export function parseStatus(v: unknown): Status {
  const s = cellText(v).toLowerCase();
  return STATUSES.find((x) => x.toLowerCase() === s) ?? "Keep";
}

/** Drive file IDs in a Photo cell (a HYPERLINK formula, a plain link, or several links). */
export function driveFileIds(v: unknown): string[] {
  const s = String(v ?? "");
  const ids = new Set<string>();
  for (const m of s.matchAll(/\/file\/d\/([\w-]{20,})/g)) ids.add(m[1]!);
  for (const m of s.matchAll(/[?&]id=([\w-]{20,})/g)) ids.add(m[1]!);
  return [...ids];
}

/** The order photos show in: the Photo column, then Back Photo (cards), then COA Photo. Cards label each side. */
export function photoSides(
  front: string[],
  back: string[],
  cards: boolean,
  coa: string[] = [],
): Array<{ fileId: string; side: "front" | "back" | "coa" | null }> {
  const out: Array<{ fileId: string; side: "front" | "back" | "coa" | null }> = [];
  const seen = new Set<string>();
  const add = (ids: string[], side: "front" | "back" | "coa" | null) => {
    for (const fileId of ids) if (!seen.has(fileId)) { seen.add(fileId); out.push({ fileId, side }); }
  };
  add(front, cards ? "front" : null);
  add(back, cards ? "back" : null);
  add(coa, "coa");
  return out;
}

// The price sentences written to Notes, newest last. Claude's checks write "Verified $X on DATE: ..." or
// "Price check DATE: no reliable sold data ...". The app writes "Free price $X on DATE: ..." (card databases)
// and "Asking $X on DATE: ..." (current eBay listings). Edits in the app write "Set by hand to $X on DATE".
const PRICE_MARKS: Array<[string, PriceSource, ValueStatus]> = [
  ["verified $", "claude", "verified"],
  ["no reliable sold data", "claude", "unverifiable"],
  ["free price $", "free", "verified"],
  ["asking $", "asking", "asking"],
  ["set by hand", "hand", "verified"],
];

function latestMark(notes: string): [string, PriceSource, ValueStatus, number] | null {
  const lower = notes.toLowerCase();
  let best: [string, PriceSource, ValueStatus, number] | null = null;
  for (const [mark, source, status] of PRICE_MARKS) {
    const at = lower.lastIndexOf(mark);
    if (at >= 0 && (!best || at > best[3])) best = [mark, source, status, at];
  }
  return best;
}

/** Whether the value has been checked, and how: against sales, a card database, or only current listings. */
export function valueStatusOf(lastChecked: string | null, notes: string): ValueStatus {
  if (!lastChecked) return "estimate";
  return latestMark(notes)?.[2] ?? "verified";
}

/** Where the current price came from. */
export function priceSource(notes: string, lastChecked: string | null): PriceSource {
  if (!lastChecked) return "none";
  return latestMark(notes)?.[1] ?? "claude";
}

/** Turns one sheet row into an item. Returns null for blank rows. */
export function parseRow(categoryName: string, headers: Headers, cells: unknown[], row: number): SheetItem | null {
  const category = categoryByName(categoryName);
  if (!category) return null;
  const get = (name: string) => {
    const i = colIndex(headers, name);
    return i === undefined ? undefined : cells[i];
  };

  const name = cellText(get(nameField(category)));
  if (!name) return null;

  const details: Record<string, string> = {};
  for (const f of category.fields.slice(1)) details[f] = cellText(get(f));

  const lastChecked = parseDate(get(COL.lastChecked));
  const notes = cellText(get(COL.notes));
  return {
    row,
    category: category.name,
    name,
    details,
    condition: cellText(get(COL.condition)),
    quantity: parseQuantity(get(COL.quantity)),
    marketValue: parseMoney(get(COL.marketValue)),
    lastChecked,
    status: parseStatus(get(COL.status)),
    notes,
    photoIds: driveFileIds(get(COL.photo)),
    backPhotoIds: driveFileIds(get(COL.backPhoto)),
    location: cellText(get(COL.location)),
    catalogId: cellText(get(COL.catalogId)),
    authenticator: cellText(get(COL.authenticator)),
    certNumber: cellText(get(COL.certNumber)),
    coaPhotoIds: driveFileIds(get(COL.coaPhoto)),
    valueStatus: valueStatusOf(lastChecked, notes),
    paid: parseMoney(get(COL.paid)),
    soldPrice: parseMoney(get(COL.soldPrice)),
    soldOn: parseDate(get(COL.soldDate)),
    psa9: parseMoney(get(COL.psa9)),
    psa10: parseMoney(get(COL.psa10)),
  };
}

/** A money field from a form: undefined keeps the current value, empty clears it. */
export function optionalMoney(v: unknown, current: number | null): number | null {
  if (v === undefined) return current;
  if (v === null || String(v).trim() === "") return null;
  return parseMoney(v);
}

/** Keeps typed text from being read as a formula when written with USER_ENTERED. */
export function safeCell(v: string): string {
  return /^[=+\-@]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? "'" + v : v;
}

/** Removes the "[Estimate $X, not verified yet]" tag Collection Intake adds before the price is checked. */
export function stripEstimateTag(notes: string): string {
  return notes.replace(/^\s*\[(?:Estimate|No estimate)[^\]]*\]\s*/i, "").trim();
}

export function appendNote(notes: string, text: string): string {
  return [notes.trim(), text.trim()].filter(Boolean).join(" ");
}

export function todayISO(timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export type CellWrite = { col: number; value: string | number };

/** Values to write for an item's editable columns. Only columns that exist in the tab are included. */
export function itemCells(
  category: Category,
  headers: Headers,
  item: {
    name?: string;
    details?: Record<string, string>;
    condition?: string;
    quantity?: number;
    marketValue?: number | null;
    lastChecked?: string | null;
    status?: Status;
    notes?: string;
    paid?: number | null;
    soldPrice?: number | null;
    soldOn?: string | null;
    location?: string;
    catalogId?: string;
    authenticator?: string;
    certNumber?: string;
    /** Drive links, written as HYPERLINK formulas. */
    photoUrl?: string;
    backPhotoUrl?: string;
    coaPhotoUrl?: string;
  },
): CellWrite[] {
  const out: CellWrite[] = [];
  const put = (header: string, value: string | number | null | undefined) => {
    if (value === undefined) return;
    const col = colIndex(headers, header);
    if (col === undefined) return;
    out.push({ col, value: value === null ? "" : typeof value === "string" ? safeCell(value) : value });
  };
  if (item.name !== undefined) put(nameField(category), item.name);
  if (item.details) for (const f of category.fields.slice(1)) put(f, item.details[f]);
  put(COL.condition, item.condition);
  put(COL.quantity, item.quantity);
  put(COL.marketValue, item.marketValue);
  put(COL.lastChecked, item.lastChecked);
  put(COL.status, item.status);
  put(COL.notes, item.notes);
  put(COL.paid, item.paid);
  put(COL.soldPrice, item.soldPrice);
  put(COL.soldDate, item.soldOn);
  put(COL.location, item.location);
  put(COL.catalogId, item.catalogId);
  put(COL.authenticator, item.authenticator);
  put(COL.certNumber, item.certNumber);
  const link = (header: string, url: string | undefined, label: string) => {
    if (!url) return;
    const col = colIndex(headers, header);
    if (col !== undefined) out.push({ col, value: `=HYPERLINK("${url.replace(/"/g, "")}","${label}")` });
  };
  link(COL.photo, item.photoUrl, "Photo");
  link(COL.backPhoto, item.backPhotoUrl, "Back");
  link(COL.coaPhoto, item.coaPhotoUrl, "COA");
  return out;
}

/** The spreadsheet ID from a Google Sheets link, or the ID itself. */
export function sheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([\w-]{20,})/);
  if (m) return m[1]!;
  return /^[\w-]{20,}$/.test(s) ? s : null;
}

/** A1 range for one cell, quoting the tab name. */
export function cellRange(tab: string, col: number, row: number): string {
  return `'${tab.replace(/'/g, "''")}'!${columnLetter(col)}${row}`;
}

/** A one-line description of where an item's current value came from, taken from its notes. */
export function priceSummary(notes: string, status: ValueStatus): string {
  if (status === "estimate") return "Not checked against sales yet.";
  const m = latestMark(notes);
  if (!m) return status === "unverifiable" ? "Checked, but no reliable sold data was found." : "Checked against recent sales.";
  const lower = notes.toLowerCase();
  // Start the sentence at its beginning ("Price check DATE: no reliable sold data" starts before the mark).
  let at = m[3];
  if (m[0] === "no reliable sold data") at = Math.max(lower.lastIndexOf("price check ", at), 0);
  const rest = notes.slice(at);
  const end = rest.search(/\.(\s|$)/);
  return (end >= 0 ? rest.slice(0, end + 1) : rest).trim().slice(0, 300);
}

/**
 * Removes earlier price-check sentences ("Verified $X on ...", "Price check ...: no reliable sold data ...",
 * "Set by hand to $X on ..."), so Notes keeps the owner's text plus only the latest result.
 */
export function stripPriceNotes(notes: string): string {
  return notes
    .replace(/\s*(?:Verified \$|Set by hand to \$|Free price \$|Asking \$)[\d,]*(?:\.\d+)? on \d{4}-\d{2}-\d{2}.*?\.(?=\s|$)/g, "")
    .replace(/\s*Price check \d{4}-\d{2}-\d{2}: no reliable sold data.*?\.(?=\s|$)/gi, "")
    .trim();
}
