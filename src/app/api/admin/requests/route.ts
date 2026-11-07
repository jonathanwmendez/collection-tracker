import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api-auth";
import { normalizeEmail } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

/** Dismisses an access request without inviting the person. */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  let email: string | null = null;
  try {
    email = normalizeEmail((await request.json()).email);
  } catch {}
  if (!email) return jsonError("Enter a valid email.", 400);
  const { error } = await createAdminClient().from("access_requests").delete().eq("email", email);
  if (error) return jsonError("Couldn't dismiss the request.", 500);
  return NextResponse.json({ ok: true });
}
