import { canCheckPrice } from "./prices";
import { priceSource } from "./sheet-format";

/** Which items the morning job reprices. Pure, so it can be tested. */
export function needsFreePrice(
  r: { category: string; name: string; notes: string | null; last_checked: string | null; sheet_row: number | null },
  o: { today: string; cutoff: string; ebayOn: boolean },
): boolean {
  if (!r.sheet_row || r.name.startsWith("Unidentified") || (r.notes ?? "").includes("[Needs identifying]")) return false;
  const source = priceSource(r.notes ?? "", r.last_checked);
  // Claude's sold-price checks and prices set by hand are never overwritten by a free source.
  if (source === "claude" || source === "hand") return false;
  if (canCheckPrice(r.category)) return r.last_checked !== o.today;
  if (r.category === "Sports Cards") return o.ebayOn && (!r.last_checked || r.last_checked < o.cutoff);
  return false;
}
