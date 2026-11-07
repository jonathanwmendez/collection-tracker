import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Value · Collection Tracker" };

export default function ValuePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Value</h1>
        <p className="text-muted">Total value, value by category, and how prices change over time.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface border border-line p-4">
          <p className="text-xs text-muted">Total value</p>
          <p className="text-2xl font-medium font-mono tabular-nums">$0.00</p>
        </div>
        <div className="rounded-xl bg-surface border border-line p-4">
          <p className="text-xs text-muted">Items</p>
          <p className="text-2xl font-medium font-mono tabular-nums">0</p>
        </div>
      </div>
      <EmptyState
        title="Charts arrive in step 5"
        body="Once items have a few price checks, you'll see your collection's value over time and which categories are worth the most."
        note="Step 5 of 5"
      />
    </div>
  );
}
