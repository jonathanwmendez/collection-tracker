import { jsonError, requireUser } from "@/lib/api-auth";
import { previewResponse, type PhotoRow } from "@/lib/previews";

export const maxDuration = 30;

/** A photo preview for the signed-in owner. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data: photo } = await auth.supabase
    .from("photos")
    .select("id, item_id, drive_file_id, preview_path")
    .eq("id", id)
    .maybeSingle();
  if (!photo) return jsonError("Photo not found.", 404);
  return previewResponse(auth.supabase, auth.user.id, photo as PhotoRow, "private, max-age=3000");
}
