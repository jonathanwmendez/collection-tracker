import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { CATEGORIES } from "@/lib/categories";
import { EmptyState } from "@/components/empty-state";
import { ItemForm } from "@/components/item-form";

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
  const button = "min-h-14 w-full max-w-xs inline-flex items-center justify-center rounded-xl bg-navy px-6 text-lg font-medium text-navy-ink no-underline";
  return (
    <div className="flex flex-col gap-10">
      <section className="min-h-[55dvh] flex flex-col items-center justify-center text-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Add items</h1>
        <p className="text-muted max-w-sm">Hold each item up to the camera. It&apos;s read, saved, and priced right away, for free when it can be.</p>
        <Link href="/scan" className={button}>
          Start scanning
        </Link>
        <p className="text-sm text-muted max-w-sm">
          For a card, scan the front, then the back.
          {settings.intake_url && (
            <>
              {" "}
              Prefer to send photos to Claude instead?{" "}
              <a href={settings.intake_url} target="_blank" rel="noopener">
                Open Collection Intake
              </a>
              .
            </>
          )}
        </p>
      </section>

      <details className="rounded-2xl border border-line bg-surface p-4 group">
        <summary className="cursor-pointer text-sm font-medium text-muted">Add without a photo</summary>
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
            location: "",
            authenticator: "",
            certNumber: "",
          }}
        />
      </details>
    </div>
  );
}
