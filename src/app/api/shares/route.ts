import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { CATEGORIES } from "@/lib/categories";
import { expiryDate } from "@/lib/share-rules";

/** Creates a view-only link to the signed-in person's collection. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the link settings.", 400);
  }
  const names = CATEGORIES.map((c) => c.name);
  const picked = Array.isArray(body.categories) ? body.categories.map(String).filter((c) => names.includes(c)) : [];
  if (Array.isArray(body.categories) && picked.length === 0) return jsonError("Pick at least one category.", 400);

  const { data, error } = await auth.supabase
    .from("shares")
    .insert({
      user_id: auth.user.id,
      token: randomBytes(16).toString("base64url"),
      title: String(body.title ?? "").trim().slice(0, 100),
      categories: picked.length === names.length || picked.length === 0 ? null : picked,
      show_values: body.showValues !== false,
      show_notes: body.showNotes === true,
      expires_at: expiryDate(String(body.expires ?? "never")),
    })
    .select("id, token")
    .single();
  if (error || !data) {
    console.error("Create share failed", error);
    return jsonError("Couldn't create the link. Has migration 0004 been run in Supabase?", 500);
  }
  return NextResponse.json(data);
}
