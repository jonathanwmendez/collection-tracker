import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getItems, getSettings } from "@/lib/data";
import { CATEGORIES } from "@/lib/categories";
import { checkNote, isSold, itemTotal, matchesQuery, sortItems, summarize } from "@/lib/collection";
import { money, plural } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { ItemList } from "@/components/item-row";
import { SearchBox } from "@/components/search-box";
import { SyncBar } from "@/components/sync";

export const metadata = { title: "Collection · Collection Tracker" };

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();
  const [settings, items] = await Promise.all([getSettings(supabase), getItems(supabase)]);

  if (!settings.sheet_id) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Collection</h1>
        <EmptyState
          title="Connect your Google Sheet"
          body="The app shows the items in your Collection Tracker sheet. The setup checklist walks you through connecting it."
        >
          <Link href="/setup" className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            Open setup
          </Link>
        </EmptyState>
      </div>
    );
  }

  const days = settings.reprice_after_days;
  const totals = summarize(items, days);
  const query = q.trim();
  const results = query ? sortItems(items.filter((i) => matchesQuery(i, query)), "value") : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Collection</h1>
          <p className="text-muted">
            {plural(totals.items, "item")} worth <span className="font-mono tabular-nums text-ink">{money(totals.total)}</span>
          </p>
        </div>
        <Link href="/share" className="min-h-9 inline-flex items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink no-underline">
          Share
        </Link>
      </div>

      <SyncBar />
      {!query && items.filter((i) => checkNote(i)).length > 0 && (
        <Link href="/collection?q=check%20this" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn no-underline">
          <span className="font-medium">{plural(items.filter((i) => checkNote(i)).length, "item")} to check.</span> Claude wasn&apos;t sure about some details. Tap to see them.
        </Link>
      )}
      <SearchBox action="/collection" defaultValue={query} placeholder="Search names, sets, years, notes" />

      {query ? (
        <section aria-labelledby="results" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="results" className="text-xs font-medium uppercase tracking-wider text-muted">
              {plural(results.length, "match", "matches")} for “{query}”
            </h2>
            <Link href="/collection" className="text-sm">
              Clear
            </Link>
          </div>
          {results.length ? (
            <ItemList items={results} repriceDays={days} showCategory />
          ) : (
            <p className="text-muted text-sm">Nothing matches. Try fewer words, or check the spelling.</p>
          )}
        </section>
      ) : items.length === 0 ? (
        <EmptyState title="No items yet" body="Items you add with Collection Intake, or type into the sheet, show up here after a sync.">
          <Link href="/add" className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            Add an item
          </Link>
        </EmptyState>
      ) : null}

      {!query && (
        <section aria-labelledby="cats" className="flex flex-col gap-3">
          <h2 id="cats" className="text-xs font-medium uppercase tracking-wider text-muted">
            Categories
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map((c) => {
              const list = items.filter((i) => i.category === c.name);
              const value = list.filter((i) => !isSold(i)).reduce((s, i) => s + itemTotal(i), 0);
              return (
                <li key={c.slug}>
                  <Link
                    href={`/collection/${c.slug}`}
                    className={`h-full rounded-xl border border-line bg-surface px-3 py-3 flex flex-col gap-1 text-ink no-underline hover:border-navy ${
                      list.length ? "" : "opacity-70"
                    }`}
                  >
                    <span className="text-sm font-medium leading-snug">{c.name}</span>
                    <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
                      <span className="tabular-nums">{plural(list.length, "item")}</span>
                      <span className="font-mono tabular-nums">{list.length ? money(value, { round: true }) : ""}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
