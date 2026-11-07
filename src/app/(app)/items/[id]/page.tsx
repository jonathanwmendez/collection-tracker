import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getItem, getSettings } from "@/lib/data";
import { categoryByName } from "@/lib/categories";
import { gradingMath, isStale, itemTotal, labeledPhotos, marketLink, realizedGain, sheetLink, unrealizedGain } from "@/lib/collection";
import { money, shortDate, signedMoney } from "@/lib/format";
import { canCheckPrice } from "@/lib/prices";
import { ItemActions } from "@/components/item-actions";
import { PhotoGallery } from "@/components/photo-gallery";
import { Sparkline } from "@/components/sparkline";
import { StatusBadge, ValueBadge } from "@/components/value-badge";

const METHOD: Record<string, string> = {
  claude_estimate: "Claude's estimate",
  sheet: "Price check",
  web_search: "Price check",
  tcgplayer: "Card database",
  manual: "Set by hand",
};

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [found, settings] = await Promise.all([getItem(supabase, id), getSettings(supabase)]);
  if (!found) notFound();
  const { item, history } = found;
  const category = categoryByName(item.category);
  const stale = isStale(item, settings.reprice_after_days);
  const market = marketLink(item);
  const sheetUrl = settings.sheet_id ? sheetLink(settings.sheet_id, settings.sheet_tabs[item.category], item.sheet_row) : null;
  const chart = history
    .filter((h) => h.value !== null)
    .map((h) => h.value!)
    .reverse();

  const rows: Array<[string, string]> = [
    ...(category?.fields.slice(1) ?? []).map((f) => [f, item.details[f] ?? ""] as [string, string]),
    ["Condition", item.condition ?? ""],
    ["Qty", String(item.quantity)],
    ["Status", item.status],
  ];

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={category ? `/collection/${category.slug}` : "/collection"} className="text-sm">
          ← {item.category}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{item.name}</h1>
        <div className="flex flex-wrap gap-1.5">
          <ValueBadge status={item.value_status} stale={stale} />
          <StatusBadge status={item.status} />
        </div>
      </div>

      {item.photos.length > 0 && (
        <PhotoGallery
          photos={labeledPhotos(item).photos.map((p, n) => ({
            id: p.id,
            preview: `/api/photos/${p.id}/preview`,
            full: `/api/photos/${p.id}/preview?size=full`,
            alt: `${item.name}, ${p.label ? p.label.toLowerCase() : `photo ${n + 1}`}`,
            driveUrl: p.drive_url,
            label: p.label,
          }))}
          missing={labeledPhotos(item).missing}
        />
      )}

      <section aria-labelledby="value" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        <h2 id="value" className="text-xs font-medium uppercase tracking-wider text-muted">
          Value
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-3xl font-medium font-mono tabular-nums">{money(item.market_value)}</span>
            <span className="text-sm text-muted">
              {item.quantity > 1 && item.market_value !== null ? `each, ${money(itemTotal(item))} for ${item.quantity}. ` : ""}
              {item.last_checked ? `Checked ${shortDate(item.last_checked)}` : "Not checked against sales yet"}
              {stale ? ", due for another check" : ""}
            </span>
          </div>
          <Sparkline values={chart} />
        </div>
        {item.value_status === "estimate" && (
          <p className="text-sm rounded-lg bg-clay-soft text-clay-ink px-3 py-2">
            This is Claude&apos;s estimate from the photo. Claude&apos;s price check verifies it against real sales, right after approval or at 3:30 AM.
          </p>
        )}
        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Price history ({history.length})</summary>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="py-2 flex flex-col gap-0.5">
                  <span className="flex justify-between gap-3">
                    <span>
                      {shortDate(h.checked_at)} · {METHOD[h.method] ?? h.method}
                    </span>
                    <span className="font-mono tabular-nums">{money(h.value)}</span>
                  </span>
                  {h.summary && <span className="text-xs text-muted">{h.summary}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {(item.paid !== null || item.status === "Sold") && (
        <section aria-labelledby="cost" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 text-sm">
          <h2 id="cost" className="text-xs font-medium uppercase tracking-wider text-muted">
            {item.status === "Sold" ? "Sale" : "Cost"}
          </h2>
          {item.paid !== null && (
            <p className="flex justify-between gap-3">
              <span>Paid{item.quantity > 1 ? `, ${item.quantity} at ${money(item.paid)}` : ""}</span>
              <span className="font-mono tabular-nums">{money(item.paid * item.quantity)}</span>
            </p>
          )}
          {item.status === "Sold" ? (
            <>
              <p className="flex justify-between gap-3">
                <span>Sold{item.sold_on ? ` ${shortDate(item.sold_on)}` : ""}</span>
                <span className="font-mono tabular-nums">{item.sold_price === null ? "Price not set" : money(item.sold_price * item.quantity)}</span>
              </p>
              {realizedGain(item) !== null && <GainLine label="Profit" value={realizedGain(item)!} />}
            </>
          ) : (
            unrealizedGain(item) !== null && <GainLine label="Gain so far" value={unrealizedGain(item)!} />
          )}
        </section>
      )}

      {(() => {
        const g = gradingMath(item, settings.grading_cost);
        if (!g) return null;
        return (
          <section aria-labelledby="grading" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-2 text-sm">
            <h2 id="grading" className="text-xs font-medium uppercase tracking-wider text-muted">
              Grading
            </h2>
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
            <p className="text-xs text-muted">
              Compared with today&apos;s ungraded value plus {money(g.cost)} to grade (set in Settings). Grades aren&apos;t guaranteed.
            </p>
          </section>
        );
      })()}

      <ItemActions id={item.id} name={item.name} category={item.category} canPrice={canCheckPrice(item.category)} />

      <section aria-labelledby="details" className="flex flex-col gap-2">
        <h2 id="details" className="text-xs font-medium uppercase tracking-wider text-muted">
          Details
        </h2>
        <dl className="rounded-2xl border border-line bg-surface divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right">{v || <span className="text-muted">None</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      {item.notes && (
        <section aria-labelledby="notes" className="flex flex-col gap-2">
          <h2 id="notes" className="text-xs font-medium uppercase tracking-wider text-muted">
            Notes
          </h2>
          <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm whitespace-pre-wrap">{item.notes}</p>
        </section>
      )}

      <nav aria-label="Links" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a href={market.url} target="_blank" rel="noopener noreferrer">
          Search {market.label}
        </a>
        {sheetUrl && (
          <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
            Open row {item.sheet_row} in the sheet
          </a>
        )}
      </nav>
    </article>
  );
}

function GainLine({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex justify-between gap-3 font-medium">
      <span>{label}</span>
      <span className={`font-mono tabular-nums ${value >= 0 ? "text-ok" : "text-bad"}`}>{signedMoney(value)}</span>
    </p>
  );
}
