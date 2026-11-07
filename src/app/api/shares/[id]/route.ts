import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";

/** Turns a share link off for good. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { error } = await auth.supabase.from("shares").delete().eq("id", id);
  if (error) return jsonError("Couldn't turn off the link.", 500);
  return NextResponse.json({ ok: true });
}
