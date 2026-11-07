import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { CATEGORIES } from "@/lib/categories";

export const metadata = { title: "Collection · Collection Tracker" };

export default function CollectionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Collection</h1>
        <p className="text-muted">{CATEGORIES.length} categories, matching the tabs in your Google Sheet.</p>
      </div>

      <EmptyState
        title="No items yet"
        body="Items you approve on the Add tab show up here with their photo, condition, and verified price."
      >
        <Link
          href="/add"
          className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline"
        >
          Add your first item
        </Link>
      </EmptyState>

      <section aria-labelledby="cats" className="flex flex-col gap-3">
        <h2 id="cats" className="text-xs font-medium uppercase tracking-wider text-muted">
          Categories
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <li key={c.slug} className="rounded-xl border border-line bg-surface px-3 py-2.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{c.name}</span>
              <span className="text-xs font-mono text-muted tabular-nums">0</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
