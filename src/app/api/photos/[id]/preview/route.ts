import sharp from "sharp";
import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { downloadDriveFile, getGoogleAccessToken, GoogleError } from "@/lib/google";

export const maxDuration = 30;

const SIZE = 720;
const CACHE = "private, max-age=3000";

/**
 * Serves a photo's preview. The first time, it downloads the full photo from Google Drive, shrinks it,
 * and keeps the small copy in Supabase Storage, so later loads are fast and don't touch Drive.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const { data: photo } = await supabase
    .from("photos")
    .select("id, item_id, drive_file_id, preview_path")
    .eq("id", id)
    .maybeSingle();
  if (!photo) return jsonError("Photo not found.", 404);

  if (photo.preview_path) {
    const { data } = await supabase.storage.from("previews").createSignedUrl(photo.preview_path, 3600);
    if (data?.signedUrl) {
      return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": CACHE } });
    }
  }
  if (!photo.drive_file_id) return jsonError("This photo has no Drive file.", 404);

  let bytes: Buffer;
  try {
    const token = await getGoogleAccessToken(user.id);
    const original = await downloadDriveFile(token, photo.drive_file_id);
    bytes = await sharp(Buffer.from(original))
      .rotate() // apply the camera's orientation tag
      .resize(SIZE, SIZE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    if (e instanceof GoogleError) return jsonError(e.message, e.status, { needsSignIn: e.needsSignIn });
    console.error("Preview failed", e);
    return jsonError("Couldn't load this photo.", 502);
  }

  const path = `${user.id}/${photo.item_id}/${photo.id}.jpg`;
  const { error } = await supabase.storage
    .from("previews")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) console.error("Saving preview failed", error);
  else await supabase.from("photos").update({ preview_path: path }).eq("id", photo.id);

  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "image/jpeg", "cache-control": CACHE },
  });
}
