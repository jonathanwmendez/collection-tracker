import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { ebayConfigured } from "@/lib/ebay";
import { EmptyState } from "@/components/empty-state";
import { Scanner } from "@/components/scanner";

export const metadata = { title: "Scan · Collection Tracker" };

export default async function ScanPage() {
  const supabase = await createClient();
  const settings = await getSettings(supabase);
  if (!settings.sheet_id) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Scan</h1>
        <EmptyState title="Connect your Google Sheet first" body="Scanned items are saved to your Collection Tracker sheet.">
          <Link href="/setup" className="mt-1 inline-flex min-h-11 items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
            Open setup
          </Link>
        </EmptyState>
      </div>
    );
  }
  return <Scanner ebayOn={ebayConfigured()} />;
}
