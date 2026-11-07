import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/api-auth";
import { isOwner, normalizeEmail } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Invites someone, or changes their role. Also clears their access request. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  if (!email) return jsonError("Enter a valid email.", 400);
  if (isOwner(email)) return jsonError("That's an owner account. Owners are set in Vercel and always have access.", 400);
  const role = body?.role === "admin" ? "admin" : "member";

  const admin = createAdminClient();
  const { error } = await admin.from("members").upsert({ email, role, invited_by: auth.user.email ?? null }, { onConflict: "email" });
  if (error) {
    console.error("Invite failed", error);
    return jsonError("Couldn't save the invite. Has migration 0003 been run in Supabase?", 500);
  }
  await admin.from("access_requests").delete().eq("email", email);
  return NextResponse.json({ ok: true, email, role });
}

/** Removes someone's access. Their data stays until they delete their account. */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const email = normalizeEmail(body?.email);
  if (!email) return jsonError("Enter a valid email.", 400);
  if (isOwner(email)) return jsonError("Owners can't be removed here. Change ADMIN_EMAILS in Vercel.", 400);
  if (email === auth.user.email?.toLowerCase()) return jsonError("You can't remove yourself.", 400);

  const { error } = await createAdminClient().from("members").delete().eq("email", email);
  if (error) {
    console.error("Remove member failed", error);
    return jsonError("Couldn't remove them. Try again.", 500);
  }
  return NextResponse.json({ ok: true });
}
