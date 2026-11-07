import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { yearOf } from "@/lib/categories";
import { ensureCategoryFolder, getGoogleAccessToken, GoogleError, photoFileName, uploadPhoto } from "@/lib/google";

export const maxDuration = 60;

const MAX_FULL = 4_000_000;
const MAX_PREVIEW = 300_000;

/**
 * Saves one photo of an item: the full-size JPEG to the category's Drive folder,
 * and a small preview to Supabase Storage for fast loading in the app.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: item } = await supabase.from("items").select("id, category, name, details").eq("id", id).maybeSingle();
  if (!item) return jsonError("That item wasn't found.", 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Couldn't read the photo. Try again.", 400);
  }
  const full = form.get("full");
  const preview = form.get("preview");
  const position = Math.max(0, Math.min(20, Number(form.get("position")) || 0));
  if (!(full instanceof File) || full.type !== "image/jpeg" || full.size > MAX_FULL) {
    return jsonError("The photo couldn't be prepared. Try a different photo.", 400);
  }
  if (!(preview instanceof File) || preview.type !== "image/jpeg" || preview.size > MAX_PREVIEW) {
    return jsonError("The photo preview couldn't be prepared.", 400);
  }

  // 1. Full-size photo to Google Drive.
  let drive: { id: string; url: string };
  try {
    const token = await getGoogleAccessToken(user.id);
    const folderId = await ensureCategoryFolder(supabase, user.id, token, item.category);
    const details = (item.details ?? {}) as Record<string, string>;
    const name = photoFileName(item.category, item.name, yearOf(details), position);
    drive = await uploadPhoto(token, folderId, name, await full.arrayBuffer());
  } catch (e) {
    if (e instanceof GoogleError) return jsonError(e.message, e.status, { needsSignIn: e.needsSignIn });
    console.error(e);
    return jsonError("The photo didn't save to Google Drive. Try again.", 502);
  }

  // 2. Small preview to Supabase Storage (private bucket, under your user ID).
  const previewPath = `${user.id}/${item.id}/${position}-${Date.now()}.jpg`;
  const { error: storageError } = await supabase.storage
    .from("previews")
    .upload(previewPath, await preview.arrayBuffer(), { contentType: "image/jpeg", upsert: false });
  if (storageError) console.error("Preview upload failed", storageError);

  // 3. Record it.
  const { error } = await supabase.from("photos").insert({
    item_id: item.id,
    user_id: user.id,
    position,
    drive_file_id: drive.id,
    drive_url: drive.url,
    preview_path: storageError ? null : previewPath,
  });
  if (error) {
    console.error("Insert photo failed", error);
    return jsonError("The photo saved to Drive, but the app couldn't record it.", 500, { driveUrl: drive.url });
  }

  return NextResponse.json({ driveUrl: drive.url, previewSaved: !storageError });
}
