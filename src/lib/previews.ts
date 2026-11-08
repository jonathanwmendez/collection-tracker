import "server-only";
import sharp from "sharp";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError } from "./api-auth";
import { downloadDriveFile, getGoogleAccessToken, GoogleError } from "./google";

// Only the small preview is kept in Supabase Storage (about 25 KB each), so tens of thousands of photos fit
// in the free plan. The full photo is streamed from Drive when someone opens it full screen.
const PREVIEW = { px: 400, quality: 70 };
const FULL = { px: 1600, quality: 82, passThroughBytes: 900_000 };
export type PreviewSize = "preview" | "full";
export const sizeFrom = (v: string | null): PreviewSize => (v === "full" ? "full" : "preview");

export type PhotoRow = { id: string; item_id: string; drive_file_id: string | null; preview_path: string | null };

/**
 * Serves a photo. The preview is made once from the Drive original and kept in Supabase Storage, so lists load
 * fast. The full size is read from Drive each time (scans are already small, so they're passed through as is).
 */
export async function previewResponse(db: SupabaseClient, ownerId: string, photo: PhotoRow, cache: string, size: PreviewSize = "preview") {
  if (size === "preview" && photo.preview_path) {
    const { data } = await db.storage.from("previews").createSignedUrl(photo.preview_path, 3600);
    if (data?.signedUrl) return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": cache } });
  }
  if (!photo.drive_file_id) return jsonError("This photo has no Drive file.", 404);

  let bytes: Buffer;
  try {
    const token = await getGoogleAccessToken(ownerId);
    const original = Buffer.from(await downloadDriveFile(token, photo.drive_file_id));
    if (size === "full") {
      bytes = original.length <= FULL.passThroughBytes && isJpeg(original)
        ? original
        : await sharp(original).rotate().resize(FULL.px, FULL.px, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: FULL.quality, mozjpeg: true }).toBuffer();
      return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg", "cache-control": cache } });
    }
    bytes = await sharp(original)
      .rotate() // apply the camera's orientation tag
      .resize(PREVIEW.px, PREVIEW.px, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: PREVIEW.quality, mozjpeg: true })
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

const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
