import { createClient } from "@/lib/supabase/server";
import { getItems } from "@/lib/data";
import { CATEGORIES } from "@/lib/categories";
import { isSold, itemTotal, subtitle, type Item } from "@/lib/collection";
import { money, plural, shortDate } from "@/lib/format";
import { priceSource } from "@/lib/sheet-format";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Insurance report · Collection Tracker" };

const BASIS: Record<string, string> = {
  claude: "Recent sales",
  free: "Card database",
  asking: "eBay asking",
  hand: "Owner",
  none: "Estimate",
};

function basis(i: Item): string {
  if (i.value_status === "unverifiable") return "Estimate (no sales data)";
  const b = BASIS[priceSource(i.notes, i.last_checked)] ?? "Estimate";
  return i.last_checked ? `${b}, ${shortDate(i.last_checked)}` : b;
}

/** Everything owned, by category, with each item's value, how it was priced, and its certificate. Prints cleanly. */
export default async function ReportPage() {
  const supabase = await createClient();
  const owned = (await getItems(supabase)).filter((i) => !isSold(i));
  const order = [...CATEGORIES.map((c) => c.name), ...new Set(owned.map((i) => i.category))];
  const groups = [...new Set(order)]
    .map((name) => ({ name, items: owned.filter((i) => i.category === name).sort((a, b) => itemTotal(b) - itemTotal(a)) }))
    .filter((g) => g.items.length);
  const total = owned.reduce((s, i) => s + itemTotal(i), 0);
  const units = owned.reduce((s, i) => s + i.quantity, 0);
  const unpriced = owned.filter((i) => i.market_value === null).length;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });

  return (
    <div className="flex flex-col gap-6 print:gap-4 print:text-[10pt]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Collection inventory</h1>
          <p className="text-sm text-muted">
            {today}. {plural(units, "item")} in {plural(groups.length, "category", "categories")}, valued at{" "}
            <span className="font-medium text-ink">{money(total)}</span>
            {unpriced ? `. ${plural(unpriced, "item has", "items have")} no value yet.` : "."}
          </p>
        </div>
        <PrintButton />
      </div>

      <table className="w-full text-sm print:text-[9pt]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium text-right">Items</th>
            <th className="py-2 font-medium text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.name} className="border-t border-line">
              <td className="py-1.5 pr-3">{g.name}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{g.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("en-US")}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{money(g.items.reduce((s, i) => s + itemTotal(i), 0))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink font-medium">
            <td className="py-1.5 pr-3">Total</td>
            <td className="py-1.5 pr-3 text-right tabular-nums">{units.toLocaleString("en-US")}</td>
            <td className="py-1.5 text-right font-mono tabular-nums">{money(total)}</td>
          </tr>
        </tbody>
      </table>

      {groups.map((g) => (
        <section key={g.name} className="flex flex-col gap-2 print:break-inside-auto">
          <h2 className="text-lg font-bold tracking-tight print:text-[12pt]">{g.name}</h2>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[640px] text-sm print:min-w-0 print:text-[8.5pt]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Condition</th>
                  <th className="py-2 pr-3 font-medium text-right">Qty</th>
                  <th className="py-2 pr-3 font-medium text-right">Each</th>
                  <th className="py-2 pr-3 font-medium text-right">Total</th>
                  <th className="py-2 pr-3 font-medium">Valued by</th>
                  <th className="py-2 font-medium">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((i) => (
                  <tr key={i.id} className="border-t border-line align-top break-inside-avoid">
                    <td className="py-1.5 pr-3">
                      <div className="font-medium">{i.name}</div>
                      {subtitle(i) && <div className="text-xs text-muted">{subtitle(i)}</div>}
                    </td>
                    <td className="py-1.5 pr-3">{i.condition}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{i.quantity}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{money(i.market_value)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{i.market_value === null ? "" : money(itemTotal(i))}</td>
                    <td className="py-1.5 pr-3 text-xs">{basis(i)}</td>
                    <td className="py-1.5 text-xs">{[i.authenticator, i.cert_number].filter(Boolean).join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs text-muted">
        Values are per item from recent sold prices, card price databases, or current eBay asking prices, as noted. Asking prices and estimates are not sales.
      </p>
    </div>
  );
}
