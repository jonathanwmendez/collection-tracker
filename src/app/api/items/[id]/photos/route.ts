import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { itemContext, ItemError, verifiedRow } from "@/lib/item-sheet";
import { colIndex, COL } from "@/lib/sheet-format";
import { writeCells } from "@/lib/sheets";
import { syncCollection } from "@/lib/sync";

export const maxDuration = 60;
type Params = { params: Promise<{ id: string }> };

const SIDES = {
  front: { header: COL.photo, label: "Photo" },
  back: { header: COL.backPhoto, label: "Back" },
  coa: { header: COL.coaPhoto, label: "COA" },
} as const;

/**
 * Attaches a photo already saved to Drive (by /api/scan/photo) to an item: its front, its back (cards),
 * or its certificate of authenticity. Writes the link to the item's row, replacing that side's photo,
 * then syncs so the app shows it.
 */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  let body: { side?: string; fileId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the photo.", 400);
  }
  const side = SIDES[body.side as keyof typeof SIDES];
  const fileId = String(body.fileId ?? "");
  if (!side) return jsonError("Unknown photo side.", 400);
  if (!/^[\w-]{20,}$/.test(fileId)) return jsonError("That photo wasn't saved to Drive.", 400);

  try {
    const ctx = await itemContext(auth.supabase, auth.user.id, id);
    if (body.side === "back" && !ctx.category.backPhoto) throw new ItemError("Only cards have a back photo.", 400);
    const { headers } = await verifiedRow(ctx);
    const col = colIndex(headers, side.header);
    if (col === undefined) throw new ItemError(`The ${ctx.category.name} tab has no "${side.header}" column. Add it to row 1 and try again.`, 409);
    const url = `https://drive.google.com/file/d/${fileId}/view`;
    await writeCells(ctx.token, ctx.sheetId, ctx.category.name, ctx.item.sheet_row!, [{ col, value: `=HYPERLINK("${url}","${side.label}")` }]);
    await syncCollection(auth.supabase, auth.user.id, { force: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't add the photo.");
  }
}
