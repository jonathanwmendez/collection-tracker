import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { CATEGORIES } from "@/lib/categories";
import { EmptyState } from "@/components/empty-state";
import { ItemForm } from "@/components/item-form";
import { SyncBar } from "@/components/sync";

export const metadata = { title: "Add items · Collection Tracker" };

export default async function AddPage() {
  const supabase = await createClient();
  const settings = await getSettings(supabase);

  if (!settings.sheet_id) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Add items</h1>
        <EmptyState title="Connect your Google Sheet first" body="New items are saved to your Collection Tracker sheet. The setup checklist walks you through connecting it.">
          <Link href="/setup" className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            Open setup
          </Link>
        </EmptyState>
      </div>
    );
  }

  const first = CATEGORIES[0]!;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Add items</h1>
        <p className="text-muted">Take photos in Collection Intake. Claude identifies each item in the background, using your Claude plan, and saves and prices it.</p>
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5 flex flex-col items-center text-center gap-4">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="text-navy">
          <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        {settings.intake_url ? (
          <a
            href={settings.intake_url}
            target="_blank"
            rel="noopener"
            className="min-h-12 w-full max-w-sm inline-flex items-center justify-center rounded-xl bg-navy px-6 text-base font-medium text-navy-ink no-underline"
          >
            Open Collection Intake
          </a>
        ) : (
          <Link
            href="/setup"
            className="min-h-12 w-full max-w-sm inline-flex items-center justify-center rounded-xl bg-navy px-6 text-base font-medium text-navy-ink no-underline"
          >
            Add your Collection Intake link
          </Link>
        )}
        <ol className="text-sm text-muted text-left flex flex-col gap-1 max-w-sm list-decimal pl-5">
          <li>Take photos. For a card, take the front, then the back.</li>
          <li>Tap Done. Claude identifies, saves, and prices the items in the background.</li>
          <li>Come back here in a few minutes. Anything Claude wasn&apos;t sure about is listed on the Collection page to check.</li>
        </ol>
      </section>

      <SyncBar />

      <details className="rounded-2xl border border-line bg-surface p-4 group">
        <summary className="cursor-pointer font-medium">Add without a photo</summary>
        <p className="text-sm text-muted mt-1 mb-4">
          Type the details yourself. Useful for cards you can look up by set and number: after saving, tap Check price now for a free market price.
        </p>
        <ItemForm
          mode="add"
          initial={{
            category: first.name,
            fields: Object.fromEntries(first.fields.map((f) => [f, ""])),
            condition: "",
            quantity: 1,
            value: "",
            status: "Keep",
            notes: "",
            paid: "",
            soldPrice: "",
            soldOn: "",
          }}
        />
      </details>
    </div>
  );
}
