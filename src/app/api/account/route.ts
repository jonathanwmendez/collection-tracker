import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { isOwner } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/paged";

/**
 * Deletes the signed-in person's account and everything the app stores for them: items, photos'
 * previews, price history, settings, and their Google connection. Their Google Sheet, Drive photos,
 * and Claude setup are untouched.
 */
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  let confirm = "";
  try {
    confirm = String((await request.json()).confirm ?? "");
  } catch {}
  if (confirm.trim().toLowerCase() !== "delete") return jsonError('Type "delete" to confirm.', 400);

  const admin = createAdminClient();

  // Previews in Storage aren't removed by the database cascade.
  const photos = await selectAll<{ id: string; item_id: string; preview_path: string | null }>((from, to) =>
    supabase.from("photos").select("id, item_id, preview_path").order("id").range(from, to),
  ).catch(() => []);
  const paths = photos.flatMap((p) =>
    [p.preview_path as string | null, `${user.id}/${p.item_id}/${p.id}-full.jpg`].filter((x): x is string => Boolean(x)),
  );
  for (let i = 0; i < paths.length; i += 500) await admin.storage.from("previews").remove(paths.slice(i, i + 500));

  // Tell Google to forget the app's access.
  const { data: token } = await admin.from("google_tokens").select("refresh_token").eq("user_id", user.id).maybeSingle();
  if (token?.refresh_token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token.refresh_token }),
    }).catch(() => undefined);
  }

  if (user.email && !isOwner(user.email)) await admin.from("members").delete().eq("email", user.email.toLowerCase());

  // Removing the user deletes their rows in every table (on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Delete account failed", error);
    return jsonError("Couldn't delete the account. Try again.", 500);
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
