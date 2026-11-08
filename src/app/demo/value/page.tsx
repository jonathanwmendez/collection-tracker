import Link from "next/link";
import { isSold } from "@/lib/collection";
import { DEMO, demoSnapshots } from "@/lib/demo-data";
import { computeMovers } from "@/lib/movers";
import { ValueDashboard } from "@/components/value-dashboard";
import type { RowView } from "@/components/item-row";

const view: RowView = { href: (id) => `/demo/items/${id}`, photo: () => "", values: true, badges: true };

export default function DemoValue() {
  const movers = computeMovers(DEMO.checks, DEMO.items.filter((i) => !isSold(i)));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Value</h1>
        <Link href="/demo/report" className="min-h-9 inline-flex items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink no-underline">
          Insurance report
        </Link>
      </div>
      <ValueDashboard
        items={DEMO.items}
        snapshots={demoSnapshots()}
        movers={movers}
        days={30}
        gradingCost={30}
        links={{ item: (id) => `/demo/items/${id}`, category: (slug) => `/demo?category=${slug}` }}
        view={view}
      />
    </div>
  );
}
