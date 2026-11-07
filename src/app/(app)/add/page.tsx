import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Add items · Collection Tracker" };

export default function AddPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Add items</h1>
        <p className="text-muted">One photo per item. Claude identifies it and finds a verified price before you approve.</p>
      </div>
      <EmptyState
        title="Photo intake is coming in step 2"
        body="This is where you'll take or upload photos, review what Claude found, and approve items into your collection."
        note="Step 2 of 5"
      />
    </div>
  );
}
