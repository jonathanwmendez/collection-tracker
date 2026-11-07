import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { itemContext, verifiedRow } from "@/lib/item-sheet";
import { itemCells } from "@/lib/sheet-format";
import { writeCells } from "@/lib/sheets";

/**
 * Queues the item for Claude's scheduled price check by clearing Last Checked in the sheet.
 * The check runs nightly at 3:30 AM on your Claude plan and prices every row with an empty Last Checked.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  try {
    const ctx = await itemContext(supabase, user.id, id);
    const { headers } = await verifiedRow(ctx);
    await writeCells(ctx.token, ctx.sheetId, ctx.category.name, ctx.item.sheet_row!, itemCells(ctx.category, headers, { lastChecked: null }));
    await supabase.from("items").update({ last_checked: null, value_status: "estimate" }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't queue the price check.");
  }
}
