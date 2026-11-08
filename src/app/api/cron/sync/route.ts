import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { GoogleError } from "@/lib/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCollection } from "@/lib/sync";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Runs every morning at 9 AM Eastern (vercel.json), after the 3:30 AM price check. Syncs everyone's
 * sheet, so the value chart gets a point every day even when nobody opens the app. It also keeps the
 * free Supabase project from pausing for inactivity.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const admin = createAdminClient();
  const { data: rows } = await admin.from("settings").select("user_id").not("sheet_id", "is", null);
  const results: Array<{ user: string; ok: boolean; items?: number; error?: string }> = [];
  const started = Date.now();

  for (const { user_id } of rows ?? []) {
    if (Date.now() - started > 50_000) {
      results.push({ user: user_id, ok: false, error: "Out of time; synced on next open." });
      continue;
    }
    try {
      const r = await syncCollection(admin, user_id, { force: true });
      results.push({ user: user_id, ok: true, items: r.items });
    } catch (e) {
      // Usually an expired Google sign-in (Testing mode ends access after 7 days). The app asks them to sign in again.
      results.push({ user: user_id, ok: false, error: e instanceof GoogleError || e instanceof Error ? e.message : "Sync failed" });
    }
  }
  console.log("Daily sync", JSON.stringify(results));
  return NextResponse.json({ synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
}
