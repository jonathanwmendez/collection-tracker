import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryByName } from "@/lib/categories";
import { certLookup, gradingMath, isStale, itemTotal, marketLink, realizedGain, unrealizedGain } from "@/lib/collection";
import { DEMO } from "@/lib/demo-data";
import { money, shortDate, signedMoney } from "@/lib/format";
import { priceSource } from "@/lib/sheet-format";
import { Sparkline } from "@/components/sparkline";
import { StatusBadge, ValueBadge } from "@/components/value-badge";

const SOURCE_LABEL: Record<string, string> = {
  claude: "Sold-price check",
  free: "Card database price",
  asking: "eBay asking price",
  hand: "Set by hand",
  none: "",
};

export function generateStaticParams() {
  return DEMO.items.map((i) => ({ id: i.id }));
}

export default async function DemoItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = DEMO.items.find((i) => i.id === id);
  if (!item) notFound();
  const category = categoryByName(item.category);
  const history = DEMO.checks.filter((c) => c.item_id === id && c.value !== null).sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  const g = gradingMath(item, 30);
  const gain = item.status === "Sold" ? realizedGain(item) : unrealizedGain(item);
  const market = marketLink(item);
  const rows: Array<[string, string]> = [
    ...(category?.fields.slice(1) ?? []).map((f) => [f, item.details[f] ?? ""] as [string, string]),
    ["Condition", item.condition ?? ""],
    ["Qty", String(item.quantity)],
    ["Status", item.status],
    ["Location", item.location ?? ""],
  ];
  const source = SOURCE_LABEL[priceSource(item.notes, item.last_checked)];
  const cert = certLookup(item.authenticator, item.cert_number);

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/demo?category=${category?.slug ?? ""}`} className="text-sm">
          ← {item.category}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{item.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          <ValueBadge status={item.value_status} stale={isStale(item, 30)} />
          <StatusBadge status={item.status} />
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Value</h2>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-3xl font-medium font-mono tabular-nums">{money(item.market_value)}</span>
            <span className="text-sm text-muted">
              {item.quantity > 1 && item.market_value !== null ? `each, ${money(itemTotal(item))} for ${item.quantity}. ` : ""}
              {item.last_checked ? `${source ? `${source}, ` : "Checked "}${shortDate(item.last_checked)}` : "Not checked against sales yet"}
            </span>
          </div>
          <Sparkline values={history.map((h) => h.value!)} />
        </div>
        {item.notes && <p className="text-sm text-muted">{item.notes}</p>}
      </section>

      {(item.paid !== null || item.status === "Sold") && (
        <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{item.status === "Sold" ? "Sale" : "Cost"}</h2>
          {item.paid !== null && (
            <p className="flex justify-between gap-3">
              <span>Paid</span>
              <span className="font-mono tabular-nums">{money(item.paid * item.quantity)}</span>
            </p>
          )}
          {item.status === "Sold" && (
            <p className="flex justify-between gap-3">
              <span>Sold {item.sold_on ? shortDate(item.sold_on) : ""}</span>
              <span className="font-mono tabular-nums">{money((item.sold_price ?? 0) * item.quantity)}</span>
            </p>
          )}
          {gain !== null && (
            <p className="flex justify-between gap-3 font-medium">
              <span>{item.status === "Sold" ? "Profit" : "Gain so far"}</span>
              <span className={`font-mono tabular-nums ${gain >= 0 ? "text-ok" : "text-bad"}`}>{signedMoney(gain)}</span>
            </p>
          )}
        </section>
      )}

      {g && (
        <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Grading</h2>
          {g.candidate && <p className="rounded-lg bg-ok-soft text-ok px-3 py-2">Worth considering for grading, if the card is in great shape.</p>}
          {item.psa9 !== null && (
            <p className="flex justify-between gap-3">
              <span>PSA 9 sells for {money(item.psa9)}</span>
              <span className="font-mono tabular-nums">{signedMoney(g.gain9!)}</span>
            </p>
          )}
          {item.psa10 !== null && (
            <p className="flex justify-between gap-3">
              <span>PSA 10 sells for {money(item.psa10)}</span>
              <span className="font-mono tabular-nums">{signedMoney(g.gain10!)}</span>
            </p>
          )}
          <p className="text-xs text-muted">Compared with today&apos;s value plus a $30 grading fee.</p>
        </section>
      )}

      {(item.authenticator || item.cert_number) && (
        <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 text-sm">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Certificate of authenticity</h2>
          <p className="flex justify-between gap-3">
            <span>{item.authenticator}</span>
            <span className="font-mono">{item.cert_number}</span>
          </p>
          {cert && (
            <p className="text-xs text-muted">
              In the app, this links to {cert.label.startsWith("Check on ") ? cert.label.slice(9) : "a search"} to confirm it. The number here is a sample.
            </p>
          )}
        </section>
      )}

      <dl className="rounded-2xl border border-line bg-surface divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v || <span className="text-muted">None</span>}</dd>
          </div>
        ))}
      </dl>

      <a href={market.url} target="_blank" rel="noopener noreferrer" className="text-sm">
        Search {market.label}
      </a>
    </article>
  );
}
