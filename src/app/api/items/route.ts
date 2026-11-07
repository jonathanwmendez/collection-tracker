import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { categoryByName, nameField, STATUSES, type Status } from "@/lib/categories";

/** Saves an approved item. Photos are uploaded separately, one per request, to stay under Vercel's size limit. */
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

  const rawFields = (body.fields && typeof body.fields === "object" ? body.fields : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const f of category.fields) fields[f] = String(rawFields[f] ?? "").trim().slice(0, 300);

  const nameKey = nameField(category);
  const name = fields[nameKey]!;
  if (!name) return jsonError(`Add a ${nameKey} before approving.`, 400);
  delete fields[nameKey];

  const condition = String(body.condition ?? "").trim().slice(0, 60);
  const quantity = Math.max(1, Math.min(100000, Math.round(Number(body.quantity) || 1)));
  const est = Number(body.estimate);
  const estimate = Number.isFinite(est) && est >= 0 && body.estimate !== null && body.estimate !== "" ? Math.round(est * 100) / 100 : null;
  const status: Status = STATUSES.includes(body.status as Status) ? (body.status as Status) : "Keep";
  const notes = String(body.notes ?? "").trim().slice(0, 4000);

  const { data: item, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      category: category.name,
      name,
      details: fields,
      condition,
      quantity,
      market_value: estimate,
      value_status: "estimate",
      status,
      notes,
    })
    .select("id")
    .single();
  if (error || !item) {
    console.error("Insert item failed", error);
    return jsonError("Couldn't save the item. Try again.", 500);
  }

  if (estimate !== null) {
    const { error: pcError } = await supabase.from("price_checks").insert({
      item_id: item.id,
      user_id: user.id,
      value: estimate,
      method: "claude_estimate",
      summary: "Claude's estimate from the photos, before checking sales.",
    });
    if (pcError) console.error("Insert price check failed", pcError);
  }

  return NextResponse.json({ id: item.id });
}
