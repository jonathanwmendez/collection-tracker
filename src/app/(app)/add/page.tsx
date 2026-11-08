import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { CATEGORIES } from "@/lib/categories";
import { EmptyState } from "@/components/empty-state";
import { ItemForm } from "@/components/item-form";

export const metadata = { title: "Add without a photo · Collection Tracker" };

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
        <h1 className="text-2xl font-bold tracking-tight">Add without a photo</h1>
        <p className="text-muted">
          Type the details yourself. Useful for cards you can look up by set and number: after saving, tap Check price now for a free market price.{" "}
          <Link href="/scan">Scan instead</Link>
        </p>
      </div>
      <section className="rounded-2xl border border-line bg-surface p-4">
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
            location: "",
            authenticator: "",
            certNumber: "",
          }}
        />
      </section>
    </div>
  );
}
