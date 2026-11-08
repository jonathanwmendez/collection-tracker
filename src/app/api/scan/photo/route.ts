import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { categoryByName } from "@/lib/categories";
import { getGoogleAccessToken, uploadDrivePhoto } from "@/lib/google";
import { scanFolder } from "@/lib/scan";

export const maxDuration = 30;
const MAX_BYTES = 3_500_000;

/** Saves one scanned photo (already compressed on the phone) to "Collection Tracker Scans/<category>" in Drive. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const category = categoryByName(url.searchParams.get("category") ?? "")?.name ?? "Other";
  const name = (url.searchParams.get("name") ?? "scan").replace(/[\\/:*?"<>|#%]+/g, " ").trim().slice(0, 120) || "scan";

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) return jsonError("The photo was empty.", 400);
  if (bytes.length > MAX_BYTES) return jsonError("That photo is too large. Try again.", 413);
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return jsonError("Photos must be JPEG.", 415);

  try {
    const token = await getGoogleAccessToken(auth.user.id);
    const folder = await scanFolder(auth.supabase, auth.user.id, token, category);
    const file = await uploadDrivePhoto(token, folder, `${name}.jpg`, bytes);
    return NextResponse.json(file);
  } catch (e) {
    return errorResponse(e, "Couldn't save the photo to Drive.");
  }
}
