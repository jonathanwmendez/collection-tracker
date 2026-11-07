// Shared helpers for the collection screens. No server-only code, so client components can use them too.

import { categoryByName } from "./categories";

export type Photo = { id: string; position: number; drive_url: string | null; side?: "front" | "back" | null };

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
  /** Per unit. Null when not filled in. */
  paid: number | null;
  sold_price: number | null;
  sold_on: string | null;
  psa9: number | null;
  psa10: number | null;
};

/**
 * Photos in display order with a label for each. Cards label their sides (Front, Back) and list a
 * side with no photo yet as missing. Other items have no labels.
 */
export function labeledPhotos(item: Pick<Item, "category" | "photos">): { photos: Array<Photo & { label?: string }>; missing: string[] } {
  if (!categoryByName(item.category)?.backPhoto) return { photos: item.photos, missing: [] };
  const fronts = item.photos.filter((p) => p.side !== "back");
  const backs = item.photos.filter((p) => p.side === "back");
  const name = (side: string, n: number, of: number) => (of > 1 ? `${side} ${n + 1}` : side);
  const photos = [
    ...fronts.map((p, n) => ({ ...p, label: name("Front", n, fronts.length) })),
    ...backs.map((p, n) => ({ ...p, label: name("Back", n, backs.length) })),
  ];
  const missing = [...(fronts.length ? [] : ["Front"]), ...(backs.length ? [] : ["Back"])];
  return { photos, missing: photos.length ? missing : [] };
}

export const SORTS = {
  value: "Highest value",
  name: "Name",
  checked: "Recently checked",
  unpriced: "Needs a price first",
} as const;
export type Sort = keyof typeof SORTS;

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function toItem(raw: Record<string, unknown>): Item {
  const photos = ((raw.photos as Photo[] | undefined) ?? []).slice().sort((a, b) => a.position - b.position);
  return {
    ...(raw as unknown as Item),
    details: (raw.details ?? {}) as Record<string, string>,
    market_value: num(raw.market_value),
    photos,
    paid: num(raw.paid),
    sold_price: num(raw.sold_price),
    sold_on: (raw.sold_on as string | null | undefined) ?? null,
    psa9: num(raw.psa9),
    psa10: num(raw.psa10),
  };
}

export const isSold = (i: Pick<Item, "status">) => i.status === "Sold";

/** Gain on what you still own: current value minus what you paid, for items with a price paid. */
export function unrealizedGain(i: Pick<Item, "quantity" | "market_value" | "paid">): number | null {
  if (i.paid === null || i.market_value === null) return null;
  return i.quantity * (i.market_value - i.paid);
}

/** Profit on a sale: sale price minus what you paid, when both are known. */
export function realizedGain(i: Pick<Item, "quantity" | "sold_price" | "paid">): number | null {
  if (i.paid === null || i.sold_price === null) return null;
  return i.quantity * (i.sold_price - i.paid);
}

export const CARD_CATEGORIES = ["Sports Cards", "Magic: The Gathering", "Yu-Gi-Oh!", "Pokémon"];

export function isGraded(i: Pick<Item, "category" | "condition" | "details">): boolean {
  return (i.condition ?? "").toLowerCase() === "graded" || Boolean((i.details["Grade"] ?? "").trim());
}

export type Grading = { cost: number; gain9: number | null; gain10: number | null; candidate: boolean };

/**
 * What grading one copy could add, after the grading fee: PSA 9 or PSA 10 price minus today's value
 * and the cost. A candidate if a PSA 10 would at least double your money after fees and clear $25.
 */
export function gradingMath(i: Item, cost: number): Grading | null {
  if (!CARD_CATEGORIES.includes(i.category) || isGraded(i) || isSold(i) || i.market_value === null) return null;
  if (i.psa9 === null && i.psa10 === null) return null;
  const base = i.market_value + cost;
  const gain9 = i.psa9 === null ? null : Math.round((i.psa9 - base) * 100) / 100;
  const gain10 = i.psa10 === null ? null : Math.round((i.psa10 - base) * 100) / 100;
  const candidate = gain10 !== null && gain10 >= Math.max(25, base);
  return { cost, gain9, gain10, candidate };
}

export const itemTotal = (i: Pick<Item, "quantity" | "market_value">) => i.quantity * (i.market_value ?? 0);

/** Prices last checked before this date (YYYY-MM-DD) are due for another check. */
export function staleCutoff(days: number, now = new Date()): string {
  const d = new Date(now.getTime() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function isStale(i: Pick<Item, "last_checked"> & Partial<Pick<Item, "status">>, days: number, now = new Date()): boolean {
  return i.status !== "Sold" && Boolean(i.last_checked && i.last_checked < staleCutoff(days, now));
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

/** Totals for what you still own. Sold items are counted separately. */
export function summarize(all: Item[], repriceDays: number) {
  let total = 0,
    verified = 0,
    pieces = 0;
  let estimates = 0,
    unverifiable = 0,
    stale = 0;
  let paid = 0,
    paidValue = 0,
    paidItems = 0;
  let soldCount = 0,
    soldRevenue = 0,
    realized = 0,
    realizedItems = 0;
  for (const i of all) {
    if (isSold(i)) {
      soldCount++;
      if (i.sold_price !== null) soldRevenue += i.quantity * i.sold_price;
      const r = realizedGain(i);
      if (r !== null) {
        realized += r;
        realizedItems++;
      }
    }
  }
  const items = all.filter((i) => !isSold(i));
  for (const i of items) {
    if (i.paid !== null && i.market_value !== null) {
      paid += i.quantity * i.paid;
      paidValue += i.quantity * i.market_value;
      paidItems++;
    }
    const t = itemTotal(i);
    total += t;
    pieces += i.quantity;
    if (i.value_status === "verified") verified += t;
    if (i.value_status === "estimate") estimates++;
    if (i.value_status === "unverifiable") unverifiable++;
    if (isStale(i, repriceDays)) stale++;
  }
  return {
    total,
    verified,
    pieces,
    items: items.length,
    estimates,
    unverifiable,
    stale,
    paid,
    paidValue,
    paidItems,
    soldCount,
    soldRevenue,
    realized,
    realizedItems,
  };
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
