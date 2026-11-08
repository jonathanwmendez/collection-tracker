import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { categoryByName, nameField, STATUSES, type Status } from "@/lib/categories";
import { getGoogleAccessToken } from "@/lib/google";
import { itemCells, optionalMoney, parseMoney } from "@/lib/sheet-format";
import { nextEmptyRow, readRow, writeCells } from "@/lib/sheets";
import { syncCollection } from "@/lib/sync";
import { findDuplicate } from "@/lib/duplicates";

export const maxDuration = 60;

/**
 * Adds an item typed in by hand (no photo) as a new row in its sheet tab, then syncs.
 * Last Checked stays empty, so Claude's nightly price check (3:30 AM) prices it.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the item.", 400);
  }

  const category = categoryByName(String(body.category));
  if (!category) return jsonError("Pick a category.", 400);

  const raw = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const f of category.fields) fields[f] = String(raw[f] ?? "").trim().slice(0, 300);
  const name = fields[nameField(category)]!;
  if (!name) return jsonError(`Add a ${nameField(category)}.`, 400);
  const details = { ...fields };
  delete details[nameField(category)];

  const condition = String(body.condition ?? "").trim().slice(0, 60);
  const quantity = Math.max(1, Math.min(100000, Math.round(Number(body.quantity) || 1)));
  const estimate = body.estimate === "" || body.estimate == null ? null : parseMoney(body.estimate);
  const status: Status = STATUSES.includes(body.status as Status) ? (body.status as Status) : "Keep";
  const typed = String(body.notes ?? "").trim().slice(0, 4000);
  const paid = optionalMoney(body.paid, null);
  const location = String(body.location ?? "").trim().slice(0, 120);
  const authenticator = String(body.authenticator ?? "").trim().slice(0, 120);
  const certNumber = String(body.certNumber ?? "").trim().slice(0, 60);
  // Same tag Collection Intake uses, so the scheduled price check treats the value as unverified.
  const notes = (estimate !== null ? `[Estimate $${estimate}, not verified yet] ` : "[No estimate yet] ") + typed;

  try {
    const { data: settings } = await supabase.from("settings").select("sheet_id").eq("user_id", user.id).maybeSingle();
    if (!settings?.sheet_id) return jsonError("Connect your Google Sheet in Settings first.", 400);
    const token = await getGoogleAccessToken(user.id);

    // Already have it? Offer to raise the quantity instead of adding a second row.
    if (body.allowDuplicate !== true) {
      const dup = await findDuplicate(supabase, { category: category.name, name, details, condition });
      if (dup) return NextResponse.json({ duplicate: dup }, { status: 409 });
    }

    const { headers } = await readRow(token, settings.sheet_id, category.name, 1);
    if (headers.size === 0) return jsonError(`Your sheet has no "${category.name}" tab.`, 400);
    const row = await nextEmptyRow(token, settings.sheet_id, category.name);
    const cells = itemCells(category, headers, { name, details, condition, quantity, marketValue: estimate, status, notes: notes.trim(), paid, location, authenticator, certNumber });
    await writeCells(token, settings.sheet_id, category.name, row, cells);

    await syncCollection(supabase, user.id);
    const { data: item } = await supabase
      .from("items")
      .select("id")
      .eq("category", category.name)
      .eq("sheet_row", row)
      .maybeSingle();
    return NextResponse.json({ id: item?.id ?? null, row });
  } catch (e) {
    return errorResponse(e, "Couldn't add the item.");
  }
}
