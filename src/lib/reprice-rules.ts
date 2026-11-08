import { canCheckPrice } from "./prices";
import { priceSource } from "./sheet-format";

/** Which items the morning job reprices. Pure, so it can be tested. */
export function needsFreePrice(
  r: { category: string; name: string; notes: string | null; last_checked: string | null; sheet_row: number | null; market_value?: number | string | null },
  o: { today: string; cutoff: string; ebayOn: boolean; threshold?: number },
): boolean {
  if (!r.sheet_row || r.name.startsWith("Unidentified") || (r.notes ?? "").includes("[Needs identifying]")) return false;
  const source = priceSource(r.notes ?? "", r.last_checked);
  // Prices set by hand are never overwritten. Claude's sold-price checks are kept while the card is worth at
  // least the "Claude Check Over" amount; below it, the card goes back to the free sources once it's due.
  if (source === "hand") return false;
  if (source === "claude") {
    const value = Number(r.market_value);
    const card = canCheckPrice(r.category) || r.category === "Sports Cards";
    if (!card || !Number.isFinite(value) || value >= (o.threshold ?? 10) || !r.last_checked || r.last_checked >= o.cutoff) return false;
  }
  if (canCheckPrice(r.category)) return r.last_checked !== o.today;
  if (r.category === "Sports Cards") return o.ebayOn && (!r.last_checked || r.last_checked < o.cutoff);
  return false;
}
