// CSV export of the collection, one row per item, for spreadsheets, Tableau, or pandas.

import { categoryByName } from "./categories";
import { itemTotal, realizedGain, unrealizedGain, type Item } from "./collection";

const COLUMNS = [
  "Category",
  "Name",
  "Details",
  "Year",
  "Condition",
  "Qty",
  "Value Each",
  "Total Value",
  "Value Status",
  "Last Checked",
  "Status",
  "Paid Each",
  "Gain",
  "Sold For Each",
  "Sold Date",
  "Realized Gain",
  "PSA 9 Each",
  "PSA 10 Each",
  "Sheet Row",
  "Notes",
] as const;

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100) : v;
  // Quote fields with commas, quotes, or line breaks. Prefix formulas so spreadsheets don't run them.
  const safe = /^[=+\-@]/.test(s) && typeof v !== "number" ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(items: Item[]): string {
  const rows = items.map((i) => {
    const fields = categoryByName(i.category)?.fields.slice(1) ?? Object.keys(i.details);
    const details = fields
      .map((f) => (i.details[f] ? `${f}: ${i.details[f]}` : ""))
      .filter(Boolean)
      .join("; ");
    const year = (i.details["Year"] || i.details["Date"] || "").match(/\d{4}/)?.[0] ?? "";
    return [
      i.category,
      i.name,
      details,
      year,
      i.condition,
      i.quantity,
      i.market_value,
      i.market_value === null ? null : itemTotal(i),
      i.value_status,
      i.last_checked,
      i.status,
      i.paid,
      i.status === "Sold" ? null : unrealizedGain(i),
      i.sold_price,
      i.sold_on,
      realizedGain(i),
      i.psa9,
      i.psa10,
      i.sheet_row,
      i.notes,
    ].map(cell);
  });
  return [COLUMNS.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";
}
