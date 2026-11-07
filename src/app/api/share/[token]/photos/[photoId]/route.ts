import { jsonError } from "@/lib/api-auth";
import { previewResponse, sizeFrom, type PhotoRow } from "@/lib/previews";
import { coversCategory } from "@/lib/share-rules";
import { getShare } from "@/lib/shares";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/** A photo preview for someone viewing a share link. Only photos of items the link covers. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await params;
  const share = await getShare(token);
  if (!share) return jsonError("This link isn't available.", 404);

  const db = createAdminClient();
  const { data: photo } = await db
    .from("photos")
    .select("id, item_id, drive_file_id, preview_path, user_id, items(category)")
    .eq("id", photoId)
    .eq("user_id", share.user_id)
    .maybeSingle();
  const category = (photo?.items as unknown as { category: string } | null)?.category;
  if (!photo || !category || !coversCategory(share, category)) return jsonError("Photo not found.", 404);
  const size = sizeFrom(new URL(request.url).searchParams.get("size"));
  return previewResponse(db, share.user_id, photo as unknown as PhotoRow, "public, max-age=3000", size);
}
