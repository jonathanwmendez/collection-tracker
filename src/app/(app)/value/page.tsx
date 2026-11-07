import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getItems, getSettings, getSnapshots } from "@/lib/data";
import { CATEGORIES, STATUSES } from "@/lib/categories";
import { isStale, itemTotal, sortItems, summarize } from "@/lib/collection";
import { money, plural } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { ItemList } from "@/components/item-row";
import { RepriceStale } from "@/components/reprice-stale";
import { SyncBar } from "@/components/sync";
import { ValueChart } from "@/components/value-chart";

export const metadata = { title: "Value · Collection Tracker" };

export default async function ValuePage() {
  const supabase = await createClient();
  const [settings, items, snapshots] = await Promise.all([getSettings(supabase), getItems(supabase), getSnapshots(supabase)]);
  const days = settings.reprice_after_days;
  const t = summarize(items, days);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Value</h1>
        {settings.sheet_id && <SyncBar />}
        <EmptyState title="Nothing to total yet" body="Once items are in your sheet and synced, this shows your collection's value and how it changes over time.">
          <Link href={settings.sheet_id ? "/add" : "/settings"} className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            {settings.sheet_id ? "Add an item" : "Connect your sheet"}
          </Link>
        </EmptyState>
      </div>
    );
  }

  const byCategory = CATEGORIES.map((c) => {
    const list = items.filter((i) => i.category === c.name);
    return { ...c, count: list.length, value: list.reduce((s, i) => s + itemTotal(i), 0) };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.value - a.value);
  const maxCat = Math.max(...byCategory.map((c) => c.value), 1);
  const byStatus = STATUSES.map((s) => {
    const list = items.filter((i) => i.status === s);
    return { status: s, count: list.length, value: list.reduce((sum, i) => sum + itemTotal(i), 0) };
  }).filter((s) => s.count > 0);
  const top = sortItems(items.filter((i) => i.market_value !== null), "value").slice(0, 10);
  const staleCount = items.filter((i) => isStale(i, days)).length;
  const verifiedShare = t.total > 0 ? Math.round((t.verified / t.total) * 100) : 0;
  const points = snapshots.map((s) => ({ date: s.taken_on, value: s.total_value }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Value</h1>
      <SyncBar />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-2xl bg-surface border border-line p-4 flex flex-col gap-1">
          <span className="text-xs text-muted">Total value</span>
          <span className="text-4xl font-medium font-mono tabular-nums">{money(t.total)}</span>
          <span className="text-sm text-muted">
            {verifiedShare}% of it checked against real sales ({money(t.verified)})
          </span>
        </div>
        <div className="rounded-2xl bg-surface border border-line p-4 flex flex-col gap-1">
          <span className="text-xs text-muted">Items</span>
          <span className="text-2xl font-medium font-mono tabular-nums">{t.items.toLocaleString("en-US")}</span>
          {t.pieces !== t.items && <span className="text-xs text-muted">{plural(t.pieces, "piece")}</span>}
        </div>
        <div className="rounded-2xl bg-surface border border-line p-4 flex flex-col gap-1">
          <span className="text-xs text-muted">Average per item</span>
          <span className="text-2xl font-medium font-mono tabular-nums">{money(t.total / Math.max(1, t.items))}</span>
        </div>
      </section>

      <section aria-labelledby="over-time" className="rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3">
        <h2 id="over-time" className="font-medium">
          Total value over time
        </h2>
        {points.length >= 2 ? (
          <ValueChart points={points} />
        ) : (
          <p className="text-sm text-muted">
            The app saves your total once a day when it syncs. The chart appears after the second day.
          </p>
        )}
      </section>

      <section aria-labelledby="by-cat" className="rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3">
        <h2 id="by-cat" className="font-medium">
          By category
        </h2>
        <ul className="flex flex-col gap-3">
          {byCategory.map((c) => (
            <li key={c.slug}>
              <Link href={`/collection/${c.slug}`} className="flex flex-col gap-1 text-ink no-underline group">
                <span className="flex justify-between gap-3 text-sm">
                  <span className="group-hover:underline">
                    {c.name} <span className="text-muted">· {plural(c.count, "item")}</span>
                  </span>
                  <span className="font-mono tabular-nums">{money(c.value)}</span>
                </span>
                <span className="h-2.5 rounded-full bg-bg overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full bg-navy" style={{ width: `${Math.max(1.5, (c.value / maxCat) * 100)}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {byStatus.length > 1 && (
          <p className="text-sm text-muted">
            {byStatus.map((s) => `${s.status}: ${money(s.value)} (${s.count})`).join(" · ")}
          </p>
        )}
      </section>

      <section aria-labelledby="attention" className="rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3">
        <h2 id="attention" className="font-medium">
          Price upkeep
        </h2>
        <ul className="text-sm flex flex-col gap-1.5">
          <li className="flex justify-between gap-3">
            <span>Waiting for their first price check</span>
            <span className="font-mono tabular-nums">{t.estimates}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>Checked more than {days} days ago</span>
            <span className="font-mono tabular-nums">{staleCount}</span>
          </li>
          <li className="flex justify-between gap-3">
            <span>No reliable sales data found</span>
            <span className="font-mono tabular-nums">{t.unverifiable}</span>
          </li>
        </ul>
        <p className="text-sm text-muted">
          Claude&apos;s price check runs nightly at 3:30 AM on your Claude plan. It prices every item waiting for a check, then rechecks up to 25 of the oldest prices. Queuing prices them all that night.
        </p>
        {staleCount > 0 && <RepriceStale count={staleCount} />}
      </section>

      {top.length > 0 && (
        <section aria-labelledby="top" className="flex flex-col gap-3">
          <h2 id="top" className="text-xs font-medium uppercase tracking-wider text-muted">
            Most valuable
          </h2>
          <ItemList items={top} repriceDays={days} showCategory />
        </section>
      )}
    </div>
  );
}
