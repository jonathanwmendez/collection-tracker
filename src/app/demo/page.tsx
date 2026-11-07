import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { isSold, itemTotal, matchesQuery, sortItems, summarize } from "@/lib/collection";
import { DEMO } from "@/lib/demo-data";
import { money, plural } from "@/lib/format";
import { ItemList, type RowView } from "@/components/item-row";
import { SearchBox } from "@/components/search-box";

const view: RowView = { href: (id) => `/demo/items/${id}`, photo: () => "", values: true, badges: true };

export default async function DemoCollection({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q = "", category: slug } = await searchParams;
  const items = DEMO.items;
  const totals = summarize(items, 30);
  const category = CATEGORIES.find((c) => c.slug === slug);
  const query = q.trim();
  const shown = query ? items.filter((i) => matchesQuery(i, query)) : category ? items.filter((i) => i.category === category.name) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {(category || query) && (
          <Link href="/demo" className="text-sm">
            ← Collection
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{category ? category.name : "Collection"}</h1>
        <p className="text-muted">
          {plural(totals.items, "item")} worth <span className="font-mono tabular-nums text-ink">{money(totals.total)}</span>
          {totals.soldCount ? `, plus ${totals.soldCount} sold` : ""}
        </p>
      </div>

      <SearchBox action="/demo" defaultValue={query} placeholder="Search names, sets, years, notes" />

      {query || category ? (
        shown.length ? (
          <ItemList items={sortItems(shown, "value")} repriceDays={30} showCategory={Boolean(query)} view={view} />
        ) : (
          <p className="text-muted text-sm">Nothing matches.</p>
        )
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => {
            const list = items.filter((i) => i.category === c.name);
            const value = list.filter((i) => !isSold(i)).reduce((s, i) => s + itemTotal(i), 0);
            return (
              <li key={c.slug}>
                <Link
                  href={`/demo?category=${c.slug}`}
                  className="h-full rounded-xl border border-line bg-surface px-3 py-3 flex flex-col gap-1 text-ink no-underline hover:border-navy"
                >
                  <span className="text-sm font-medium leading-snug">{c.name}</span>
                  <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
                    <span className="tabular-nums">{plural(list.length, "item")}</span>
                    <span className="font-mono tabular-nums">{money(value, { round: true })}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
