import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getItems, getMovers, getSettings, getSnapshots } from "@/lib/data";
import { isSold, isStale } from "@/lib/collection";
import { EmptyState } from "@/components/empty-state";
import { RepriceStale } from "@/components/reprice-stale";
import { SyncBar } from "@/components/sync";
import { ValueDashboard } from "@/components/value-dashboard";

export const metadata = { title: "Value · Collection Tracker" };

export default async function ValuePage() {
  const supabase = await createClient();
  const [settings, items, snapshots] = await Promise.all([getSettings(supabase), getItems(supabase), getSnapshots(supabase)]);
  const days = settings.reprice_after_days;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Value</h1>
        {settings.sheet_id && <SyncBar />}
        <EmptyState title="Nothing to total yet" body="Once items are in your sheet and synced, this shows your collection's value and how it changes over time.">
          <Link href={settings.sheet_id ? "/scan" : "/setup"} className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            {settings.sheet_id ? "Add an item" : "Connect your sheet"}
          </Link>
        </EmptyState>
      </div>
    );
  }

  const owned = items.filter((i) => !isSold(i));
  const movers = await getMovers(supabase, owned);
  const staleCount = owned.filter((i) => isStale(i, days)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Value</h1>
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/report" className="min-h-9 inline-flex items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink no-underline">
            Insurance report
          </Link>
          <a href="/api/export" className="min-h-9 inline-flex items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink no-underline">
            Export CSV
          </a>
        </div>
      </div>
      <SyncBar />
      <ValueDashboard
        items={items}
        snapshots={snapshots}
        movers={movers}
        days={days}
        gradingCost={settings.grading_cost}
        links={{ item: (id) => `/items/${id}`, category: (slug) => `/collection/${slug}` }}
        upkeepAction={<RepriceStale count={staleCount} />}
      />
    </div>
  );
}
