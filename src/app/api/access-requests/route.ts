import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-auth";
import { normalizeEmail } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_PENDING = 500;

/**
 * Public: someone without access asks for an invite from the login page.
 * They can't sign in with Google first, because Google blocks accounts that aren't test users.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the request.", 400);
  }
  // Hidden field that people never fill in. Bots usually do.
  if (String(body.website ?? "")) return NextResponse.json({ ok: true });

  const email = normalizeEmail(body.email);
  if (!email) return jsonError("Enter the Google account email you'll sign in with.", 400);
  const name = String(body.name ?? "").trim().slice(0, 100);
  const note = String(body.note ?? "").trim().slice(0, 500);

  const admin = createAdminClient();
  const { count } = await admin.from("access_requests").select("email", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_PENDING) return jsonError("Requests are closed for now. Try again later.", 429);

  const { error } = await admin.from("access_requests").upsert({ email, name, note }, { onConflict: "email" });
  if (error) {
    console.error("Access request failed", error);
    return jsonError("Couldn't send the request. Try again.", 500);
  }
  return NextResponse.json({ ok: true });
}
