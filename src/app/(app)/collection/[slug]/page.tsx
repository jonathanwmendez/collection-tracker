import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getItems, getSettings } from "@/lib/data";
import { CATEGORIES, STATUSES } from "@/lib/categories";
import { matchesQuery, SORTS, sortItems, summarize, type Sort } from "@/lib/collection";
import { money, plural } from "@/lib/format";
import { canCheckPrice } from "@/lib/prices";
import { CheckAllPrices } from "@/components/check-prices";
import { EmptyState } from "@/components/empty-state";
import { ItemList } from "@/components/item-row";
import { SearchBox } from "@/components/search-box";
import { SortSelect } from "@/components/sort-select";

const PRICE_SOURCE: Record<string, string> = {
  "Magic: The Gathering": "Scryfall",
  "Pokémon": "the Pokémon TCG API",
  "Yu-Gi-Oh!": "YGOPRODeck",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = CATEGORIES.find((x) => x.slug === slug);
  return { title: `${c?.name ?? "Category"} · Collection Tracker` };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sort?: string; status?: string }>;
}) {
  const { slug } = await params;
  const { q = "", sort: rawSort, status } = await searchParams;
  const category = CATEGORIES.find((c) => c.slug === slug);
  if (!category) notFound();

  const supabase = await createClient();
  const [settings, all] = await Promise.all([getSettings(supabase), getItems(supabase, category.name)]);
  const days = settings.reprice_after_days;
  const sort: Sort = rawSort && rawSort in SORTS ? (rawSort as Sort) : "value";
  const statusFilter = STATUSES.find((s) => s === status);

  const filtered = sortItems(
    all.filter((i) => (!statusFilter || i.status === statusFilter) && matchesQuery(i, q)),
    sort,
  );
  const totals = summarize(all, days);
  const href = (s?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort !== "value") p.set("sort", sort);
    if (s) p.set("status", s);
    const str = p.toString();
    return `/collection/${slug}${str ? `?${str}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href="/collection" className="text-sm">
          ← Collection
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{category.name}</h1>
        <p className="text-muted">
          {plural(totals.items, "item")}
          {totals.pieces !== totals.items ? ` (${totals.pieces} pieces)` : ""} worth{" "}
          <span className="font-mono tabular-nums text-ink">{money(totals.total)}</span>
          {totals.soldCount ? `, plus ${totals.soldCount} sold` : ""}
        </p>
      </div>

      {all.length === 0 ? (
        <EmptyState title={`No ${category.name} yet`} body="Scan items with Add, or type them into this tab of your sheet.">
          <Link href="/scan" className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            Add an item
          </Link>
        </EmptyState>
      ) : (
        <>
          {canCheckPrice(category.name) && (
            <CheckAllPrices items={all.filter((i) => i.status !== "Sold").map((i) => ({ id: i.id, name: i.name }))} source={PRICE_SOURCE[category.name]!} />
          )}

          <SearchBox
            action={`/collection/${slug}`}
            defaultValue={q}
            placeholder={`Search ${category.name}`}
            hidden={{ ...(sort !== "value" ? { sort } : {}), ...(statusFilter ? { status: statusFilter } : {}) }}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              {[undefined, ...STATUSES].map((s) => {
                const active = s === statusFilter;
                const count = s ? all.filter((i) => i.status === s).length : all.length;
                return (
                  <Link
                    key={s ?? "all"}
                    href={href(s)}
                    aria-current={active ? "true" : undefined}
                    className={`min-h-9 inline-flex items-center rounded-full px-3 text-sm no-underline border ${
                      active ? "bg-navy text-navy-ink border-navy" : "bg-surface text-ink border-line"
                    }`}
                  >
                    {s ?? "All"} <span className={`ml-1.5 text-xs ${active ? "" : "text-muted"}`}>{count}</span>
                  </Link>
                );
              })}
            </nav>
            <SortSelect value={sort} />
          </div>

          {filtered.length ? (
            <ItemList items={filtered} repriceDays={days} />
          ) : (
            <p className="text-muted text-sm">No items match. Try another filter or search.</p>
          )}
        </>
      )}
    </div>
  );
}
