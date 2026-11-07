// Shared helpers for the collection screens. No server-only code, so client components can use them too.

import { categoryByName } from "./categories";

export type Photo = { id: string; position: number; drive_url: string | null };

export type Item = {
  id: string;
  category: string;
  name: string;
  details: Record<string, string>;
  condition: string | null;
  quantity: number;
  market_value: number | null;
  value_status: "estimate" | "verified" | "unverifiable";
  last_checked: string | null;
  status: "Keep" | "Sell" | "Listed" | "Sold";
  notes: string;
  sheet_row: number | null;
  updated_at: string;
  photos: Photo[];
};

export const SORTS = {
  value: "Highest value",
  name: "Name",
  checked: "Recently checked",
  unpriced: "Needs a price first",
} as const;
export type Sort = keyof typeof SORTS;

export function toItem(raw: Record<string, unknown>): Item {
  const photos = ((raw.photos as Photo[] | undefined) ?? []).slice().sort((a, b) => a.position - b.position);
  return {
    ...(raw as unknown as Item),
    details: (raw.details ?? {}) as Record<string, string>,
    market_value: raw.market_value === null || raw.market_value === undefined ? null : Number(raw.market_value),
    photos,
  };
}

export const itemTotal = (i: Pick<Item, "quantity" | "market_value">) => i.quantity * (i.market_value ?? 0);

/** Prices last checked before this date (YYYY-MM-DD) are due for another check. */
export function staleCutoff(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function isStale(i: Pick<Item, "last_checked">, days: number, now = new Date()): boolean {
  return Boolean(i.last_checked && i.last_checked < staleCutoff(days, now));
}

/** The item's details in one line, like "1996 · Playmates Space Jam". */
export function subtitle(i: Pick<Item, "category" | "details">): string {
  const fields = categoryByName(i.category)?.fields.slice(1) ?? Object.keys(i.details);
  return fields
    .map((f) => (i.details[f] ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function matchesQuery(i: Item, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [i.name, i.category, i.condition ?? "", i.status, i.notes, ...Object.values(i.details)].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function sortItems(items: Item[], sort: Sort): Item[] {
  const list = items.slice();
  switch (sort) {
    case "name":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "checked":
      return list.sort((a, b) => (b.last_checked ?? "").localeCompare(a.last_checked ?? ""));
    case "unpriced":
      return list.sort((a, b) => Number(a.value_status !== "estimate") - Number(b.value_status !== "estimate") || itemTotal(b) - itemTotal(a));
    default:
      return list.sort((a, b) => itemTotal(b) - itemTotal(a) || a.name.localeCompare(b.name));
  }
}

export function summarize(items: Item[], repriceDays: number) {
  let total = 0,
    verified = 0,
    pieces = 0;
  let estimates = 0,
    unverifiable = 0,
    stale = 0;
  for (const i of items) {
    const t = itemTotal(i);
    total += t;
    pieces += i.quantity;
    if (i.value_status === "verified") verified += t;
    if (i.value_status === "estimate") estimates++;
    if (i.value_status === "unverifiable") unverifiable++;
    if (isStale(i, repriceDays)) stale++;
  }
  return { total, verified, pieces, items: items.length, estimates, unverifiable, stale };
}

// ---------- outside links ----------

const TCG_GAME: Record<string, string> = {
  "Magic: The Gathering": "magic",
  "Yu-Gi-Oh!": "yugioh",
  "Pokémon": "pokemon",
};

/** A search for the item on TCGplayer (card games) or eBay sold listings (everything else). */
export function marketLink(i: Pick<Item, "category" | "name" | "details">): { label: string; url: string } {
  const game = TCG_GAME[i.category];
  if (game) {
    return { label: "TCGplayer", url: `https://www.tcgplayer.com/search/${game}/product?q=${encodeURIComponent(i.name)}` };
  }
  const fields = categoryByName(i.category)?.fields.slice(1, 4) ?? [];
  const q = [i.name, ...fields.map((f) => i.details[f] ?? "")].filter(Boolean).join(" ");
  return { label: "eBay sold", url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1` };
}

export function sheetLink(sheetId: string, gid?: number, row?: number | null): string {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  if (gid === undefined) return base;
  return `${base}#gid=${gid}${row ? `&range=A${row}` : ""}`;
}

export const VALUE_LABEL: Record<Item["value_status"], string> = {
  estimate: "Estimate",
  verified: "Verified",
  unverifiable: "No sales data",
};
