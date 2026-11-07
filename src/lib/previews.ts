import "server-only";
import sharp from "sharp";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "./api-auth";
import { downloadDriveFile, getGoogleAccessToken, GoogleError } from "./google";

const SIZE = 720;

export type PhotoRow = { id: string; item_id: string; drive_file_id: string | null; preview_path: string | null };

/**
 * Serves a photo's preview. The first time, it downloads the full photo from the owner's Google Drive,
 * shrinks it, and keeps the small copy in Supabase Storage, so later loads are fast and don't touch Drive.
 */
export async function previewResponse(db: SupabaseClient, ownerId: string, photo: PhotoRow, cache: string) {
  if (photo.preview_path) {
    const { data } = await db.storage.from("previews").createSignedUrl(photo.preview_path, 3600);
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": cache } });
  }
  if (!photo.drive_file_id) return jsonError("This photo has no Drive file.", 404);

  let bytes: Buffer;
  try {
    const token = await getGoogleAccessToken(ownerId);
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

  const path = `${ownerId}/${photo.item_id}/${photo.id}.jpg`;
  const { error } = await db.storage.from("previews").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) console.error("Saving preview failed", error);
  else await db.from("photos").update({ preview_path: path }).eq("id", photo.id);

  return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "cache-control": cache } });
}
