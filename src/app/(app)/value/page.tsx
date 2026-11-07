import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getItems, getMovers, getSettings, getSnapshots, type Snapshot } from "@/lib/data";
import { CATEGORIES, STATUSES } from "@/lib/categories";
import { gradingMath, isSold, isStale, itemTotal, sortItems, summarize } from "@/lib/collection";
import { money, plural, shortDate, signedMoney, signedPct } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { ItemList } from "@/components/item-row";
import { RepriceStale } from "@/components/reprice-stale";
import { SyncBar } from "@/components/sync";
import { ValueChart } from "@/components/value-chart";

export const metadata = { title: "Value · Collection Tracker" };

/** The snapshot to compare today against: about 30 days ago, or the oldest one at least a week old. */
function baseline(snapshots: Snapshot[]): Snapshot | null {
  const day = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
  const older = snapshots.filter((s) => s.taken_on <= day(30));
  if (older.length) return older[older.length - 1]!;
  const week = snapshots.filter((s) => s.taken_on <= day(7));
  return week[0] ?? null;
}

const card = "rounded-2xl bg-surface border border-line p-4 flex flex-col gap-3";
const tone = (n: number) => (n >= 0 ? "text-ok" : "text-bad");

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
          <Link href={settings.sheet_id ? "/add" : "/setup"} className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            {settings.sheet_id ? "Add an item" : "Connect your sheet"}
          </Link>
        </EmptyState>
      </div>
    );
  }

  const owned = items.filter((i) => !isSold(i));
  const movers = await getMovers(supabase, owned);
  const up = movers.filter((m) => m.change > 0).slice(0, 5);
  const down = movers.filter((m) => m.change < 0).slice(0, 5);
  const base = baseline(snapshots);

  const byCategory = CATEGORIES.map((c) => {
    const list = owned.filter((i) => i.category === c.name);
    const value = list.reduce((s, i) => s + itemTotal(i), 0);
    const before = base?.by_category?.[c.name];
    return { ...c, count: list.length, value, change: before === undefined ? null : value - before };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.value - a.value);
  const maxCat = Math.max(...byCategory.map((c) => c.value), 1);
  const byStatus = STATUSES.filter((s) => s !== "Sold")
    .map((s) => {
      const list = owned.filter((i) => i.status === s);
      return { status: s, count: list.length, value: list.reduce((sum, i) => sum + itemTotal(i), 0) };
    })
    .filter((s) => s.count > 0);
  const top = sortItems(owned.filter((i) => i.market_value !== null), "value").slice(0, 10);
  const grading = owned
    .map((i) => ({ item: i, g: gradingMath(i, settings.grading_cost) }))
    .filter((x) => x.g?.candidate)
    .sort((a, b) => (b.g!.gain10 ?? 0) - (a.g!.gain10 ?? 0))
    .slice(0, 10);
  const staleCount = owned.filter((i) => isStale(i, days)).length;
  const verifiedShare = t.total > 0 ? Math.round((t.verified / t.total) * 100) : 0;
  const points = snapshots.map((s) => ({ date: s.taken_on, value: s.total_value }));
  const sinceBase = base ? t.total - base.total_value : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Value</h1>
        <a href="/api/export" className="min-h-9 inline-flex items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink no-underline">
          Export CSV
        </a>
      </div>
      <SyncBar />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-2xl bg-surface border border-line p-4 flex flex-col gap-1">
          <span className="text-xs text-muted">Total value</span>
          <span className="text-4xl font-medium font-mono tabular-nums">{money(t.total)}</span>
          {sinceBase !== null && base && (
            <span className={`text-sm font-mono tabular-nums ${tone(sinceBase)}`}>
              {signedMoney(sinceBase)} since {shortDate(base.taken_on)}
            </span>
          )}
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

      {(t.paidItems > 0 || t.soldCount > 0) && (
        <section aria-labelledby="gains" className={card}>
          <h2 id="gains" className="font-medium">
            Paid and sold
          </h2>
          {t.paidItems > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="flex justify-between gap-3">
                <span>
                  You paid {money(t.paid)} for {plural(t.paidItems, "item")} now worth {money(t.paidValue)}
                </span>
                <span className={`font-mono tabular-nums shrink-0 ${tone(t.paidValue - t.paid)}`}>{signedMoney(t.paidValue - t.paid)}</span>
              </p>
              {t.paidItems < t.items && <p className="text-xs text-muted">Add what you paid on other items to include them.</p>}
            </div>
          )}
          {t.soldCount > 0 && (
            <div className="flex flex-col gap-1 text-sm">
              <p className="flex justify-between gap-3">
                <span>
                  Sold {plural(t.soldCount, "item")} for {money(t.soldRevenue)}
                </span>
                {t.realizedItems > 0 && <span className={`font-mono tabular-nums shrink-0 ${tone(t.realized)}`}>{signedMoney(t.realized)}</span>}
              </p>
              {t.realizedItems > 0 && <p className="text-xs text-muted">Profit counts sold items with both a sale price and what you paid.</p>}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="over-time" className={card}>
        <h2 id="over-time" className="font-medium">
          Total value over time
        </h2>
        {points.length >= 2 ? (
          <ValueChart points={points} />
        ) : (
          <p className="text-sm text-muted">The app saves your total every morning. The chart appears after the second day.</p>
        )}
      </section>

      {(up.length > 0 || down.length > 0) && (
        <section aria-labelledby="movers" className={card}>
          <h2 id="movers" className="font-medium">
            Biggest price changes
          </h2>
          <p className="text-xs text-muted -mt-2">Latest change from the price checks in the last 90 days, for everything you own.</p>
          {[
            { label: "Up", list: up },
            { label: "Down", list: down },
          ]
            .filter((g) => g.list.length)
            .map((g) => (
              <div key={g.label} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{g.label}</h3>
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {g.list.map((m) => (
                    <li key={m.id}>
                      <Link href={`/items/${m.id}`} className="flex justify-between gap-3 py-2 text-ink no-underline">
                        <span className="min-w-0">
                          <span className="block truncate">{m.name}</span>
                          <span className="block text-xs text-muted font-mono tabular-nums">
                            {money(m.from)} to {money(m.to)}, {shortDate(m.on)}
                          </span>
                        </span>
                        <span className={`font-mono tabular-nums shrink-0 text-right ${tone(m.change)}`}>
                          {signedMoney(m.change)}
                          <span className="block text-xs">{signedPct(m.pct)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}

      <section aria-labelledby="by-cat" className={card}>
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
                  <span className="font-mono tabular-nums text-right">
                    {money(c.value)}
                    {c.change !== null && Math.abs(c.change) >= 0.01 && (
                      <span className={`ml-2 text-xs ${tone(c.change)}`}>{signedMoney(c.change)}</span>
                    )}
                  </span>
                </span>
                <span className="h-2.5 rounded-full bg-bg overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full bg-navy" style={{ width: `${Math.max(1.5, (c.value / maxCat) * 100)}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {base && <p className="text-xs text-muted">Changes are since {shortDate(base.taken_on)}.</p>}
        {byStatus.length > 1 && (
          <p className="text-sm text-muted">{byStatus.map((s) => `${s.status}: ${money(s.value)} (${s.count})`).join(" · ")}</p>
        )}
      </section>

      {grading.length > 0 && (
        <section aria-labelledby="grading" className={card}>
          <h2 id="grading" className="font-medium">
            Grading candidates
          </h2>
          <p className="text-xs text-muted -mt-2">
            Ungraded cards where a PSA 10 would at least double today&apos;s value after a {money(settings.grading_cost)} grading fee. Only worth it if the
            card is in great shape.
          </p>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {grading.map(({ item, g }) => (
              <li key={item.id}>
                <Link href={`/items/${item.id}`} className="flex justify-between gap-3 py-2 text-ink no-underline">
                  <span className="min-w-0">
                    <span className="block truncate">{item.name}</span>
                    <span className="block text-xs text-muted font-mono tabular-nums">
                      {money(item.market_value)} now
                      {item.psa9 !== null ? `, PSA 9 ${money(item.psa9)}` : ""}, PSA 10 {money(item.psa10)}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums shrink-0 text-ok text-right">
                    {signedMoney(g!.gain10!)}
                    <span className="block text-xs text-muted">if PSA 10</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="attention" className={card}>
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
          Claude&apos;s price check runs nightly at 3:30 AM on your Claude plan. It prices every item waiting for a check, then rechecks the oldest
          prices until none are due or it reaches 8:00 AM. Each run is logged in the sheet&apos;s Price Log tab.
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
