import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { STATUSES, type Status } from "@/lib/categories";
import { itemContext, ItemError, verifiedRow } from "@/lib/item-sheet";
import { appendNote, itemCells, parseMoney, priceSummary, todayISO } from "@/lib/sheet-format";
import { deleteRow, writeCells } from "@/lib/sheets";
import { syncCollection } from "@/lib/sync";

type Params = { params: Promise<{ id: string }> };

/** Saves edits to the item's row in the sheet, then to the app. */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the changes.", 400);
  }

  try {
    const ctx = await itemContext(supabase, user.id, id);
    const { item, category } = ctx;

    const raw = (body.details && typeof body.details === "object" ? body.details : {}) as Record<string, unknown>;
    const details: Record<string, string> = {};
    for (const f of category.fields.slice(1)) details[f] = String(raw[f] ?? item.details?.[f] ?? "").trim().slice(0, 300);
    const name = String(body.name ?? item.name).trim().slice(0, 300);
    if (!name) throw new ItemError(`Add a ${category.fields[0]}.`, 400);
    const condition = String(body.condition ?? item.condition ?? "").trim().slice(0, 60);
    const quantity = Math.max(1, Math.min(100000, Math.round(Number(body.quantity) || item.quantity)));
    const status: Status = STATUSES.includes(body.status as Status) ? (body.status as Status) : (item.status as Status);
    let notes = String(body.notes ?? item.notes ?? "").trim().slice(0, 4000);

    const before = item.market_value === null ? null : Number(item.market_value);
    const marketValue = body.marketValue === "" || body.marketValue === null ? null : parseMoney(body.marketValue ?? before);
    const valueChanged = marketValue !== before;
    let lastChecked = item.last_checked;
    let valueStatus = item.value_status;
    if (valueChanged && marketValue !== null) {
      // A value you type counts as checked, so the scheduled price check leaves it alone until it's due again.
      lastChecked = todayISO();
      valueStatus = "verified";
      notes = appendNote(notes, `Set by hand to $${marketValue} on ${lastChecked}.`);
    } else if (valueChanged) {
      lastChecked = null;
      valueStatus = "estimate";
    }

    const { headers } = await verifiedRow(ctx);
    const cells = itemCells(category, headers, {
      name,
      details,
      condition,
      quantity,
      status,
      notes,
      ...(valueChanged ? { marketValue, lastChecked } : {}),
    });
    await writeCells(ctx.token, ctx.sheetId, category.name, item.sheet_row!, cells);

    const { error } = await supabase
      .from("items")
      .update({ name, details, condition, quantity, status, notes, market_value: marketValue, last_checked: lastChecked, value_status: valueStatus })
      .eq("id", id);
    if (error) console.error("Update item failed", error);
    if (valueChanged && marketValue !== null) {
      await supabase.from("price_checks").insert({
        item_id: id,
        user_id: user.id,
        value: marketValue,
        method: "manual",
        summary: priceSummary(notes, "verified"),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't save the changes.");
  }
}

/** Deletes the item's row from the sheet, then re-syncs because the rows below it move up. */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  try {
    const ctx = await itemContext(supabase, user.id, id);
    const gid = ctx.tabs[ctx.category.name];
    if (gid === undefined) throw new ItemError("Sync first so the app knows the sheet's tabs.", 409);
    await verifiedRow(ctx);
    await deleteRow(ctx.token, ctx.sheetId, gid, ctx.item.sheet_row!);
    await syncCollection(supabase, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "Couldn't delete the item.");
  }
}
