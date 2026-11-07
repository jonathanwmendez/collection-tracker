import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { itemTotal, matchesQuery, sortItems } from "@/lib/collection";
import { money, plural } from "@/lib/format";
import { countView, getShare, getSharedItems, ownerFirstName } from "@/lib/shares";
import { ItemList, type RowView } from "@/components/item-row";
import { SearchBox } from "@/components/search-box";
import { Unavailable } from "./unavailable";

export default async function SharedCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { token } = await params;
  const { category: slug, q = "" } = await searchParams;
  const share = await getShare(token);
  if (!share) return <Unavailable />;

  const [items, first] = await Promise.all([getSharedItems(share), share.title ? Promise.resolve("") : ownerFirstName(share.user_id)]);
  if (!slug && !q) await countView(share).catch(() => undefined);

  const title = share.title || (first ? `${first}'s collection` : "Shared collection");
  const base = `/s/${token}`;
  const view: RowView = {
    href: (id) => `${base}/items/${id}`,
    photo: (photoId) => `/api/share/${token}/photos/${photoId}`,
    values: share.show_values,
    badges: false,
  };
  const cats = CATEGORIES.map((c) => {
    const list = items.filter((i) => i.category === c.name);
    return { ...c, list, value: list.reduce((s, i) => s + itemTotal(i), 0) };
  }).filter((c) => c.list.length > 0);
  const category = cats.find((c) => c.slug === slug);
  const query = q.trim();
  const shown = query ? items.filter((i) => matchesQuery(i, query)) : category ? category.list : [];
  const total = items.reduce((s, i) => s + itemTotal(i), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {(category || query) && (
          <Link href={base} className="text-sm">
            ← All categories
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-balance">{category ? category.name : title}</h1>
        <p className="text-muted">
          {plural(category ? category.list.length : items.length, "item")}
          {share.show_values && (
            <>
              {" "}
              worth <span className="font-mono tabular-nums text-ink">{money(category ? category.value : total)}</span>
            </>
          )}
        </p>
      </div>

      <SearchBox action={base} defaultValue={query} placeholder="Search this collection" />

      {query || category ? (
        shown.length ? (
          <ItemList items={sortItems(shown, share.show_values ? "value" : "name")} repriceDays={30} showCategory={Boolean(query)} view={view} />
        ) : (
          <p className="text-muted text-sm">Nothing matches.</p>
        )
      ) : cats.length === 0 ? (
        <p className="text-muted">Nothing here yet.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cats.map((c) => (
            <li key={c.slug}>
              <Link
                href={`${base}?category=${c.slug}`}
                className="h-full rounded-xl border border-line bg-surface px-3 py-3 flex flex-col gap-1 text-ink no-underline hover:border-navy"
              >
                <span className="text-sm font-medium leading-snug">{c.name}</span>
                <span className="flex items-baseline justify-between gap-2 text-xs text-muted">
                  <span className="tabular-nums">{plural(c.list.length, "item")}</span>
                  {share.show_values && <span className="font-mono tabular-nums">{money(c.value, { round: true })}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
