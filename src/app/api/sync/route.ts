import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { syncCollection } from "@/lib/sync";

export const maxDuration = 60;

/** Pulls the latest rows from the Google Sheet into the app. */
export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const result = await syncCollection(auth.supabase, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e, "Sync failed. Try again.");
  }
}
