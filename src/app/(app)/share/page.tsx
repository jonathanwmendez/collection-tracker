import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getItems } from "@/lib/data";
import type { Share } from "@/lib/share-rules";
import { Notice } from "@/components/notice";
import { ShareManager } from "@/components/share-manager";

export const metadata = { title: "Share · Collection Tracker" };

export default async function SharePage() {
  const supabase = await createClient();
  const [{ data, error }, items] = await Promise.all([
    supabase.from("shares").select("*").order("created_at", { ascending: false }),
    getItems(supabase),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.category] = (counts[i.category] ?? 0) + 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Share</h1>
        <p className="text-muted">Create view-only links to your collection. Turn a link off anytime.</p>
      </div>
      {error && (
        <Notice kind="warn">
          Sharing needs its table. Run <code>supabase/migrations/0004_shares.sql</code> in the Supabase SQL Editor.
        </Notice>
      )}
      <ShareManager shares={(data ?? []) as Share[]} origin={origin} counts={counts} />
    </div>
  );
}
