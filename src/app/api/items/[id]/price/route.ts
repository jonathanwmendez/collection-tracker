import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { itemContext, verifiedRow } from "@/lib/item-sheet";
import { canCheckPrice, lookupCardPrice } from "@/lib/prices";
import { appendNote, itemCells, stripEstimateTag, stripPriceNotes, todayISO } from "@/lib/sheet-format";
import { writeCells } from "@/lib/sheets";

export const maxDuration = 30;

/** Checks a Magic, Pokémon, or Yu-Gi-Oh! card's market price in a free card database and saves it to the sheet. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  try {
    const ctx = await itemContext(supabase, user.id, id);
    const { item, category } = ctx;
    if (!canCheckPrice(category.name)) return jsonError("Free price checks only cover Magic, Pokémon, and Yu-Gi-Oh! cards.", 400);

    let result;
    try {
      result = await lookupCardPrice({ category: category.name, name: item.name, details: item.details ?? {} });
    } catch (e) {
      console.error("Card price lookup failed", e);
      return jsonError("The card price database didn't respond. Try again in a minute.", 502);
    }
    if (!result.found) return NextResponse.json(result);

    const today = todayISO();
    const condition = (item.condition ?? "").trim();
    const conditionNote = condition && condition !== "NM" ? `, near-mint price (card is ${condition})` : "";
    const notes = appendNote(
      stripPriceNotes(stripEstimateTag(item.notes ?? "")),
      `Free price $${result.value} on ${today}: ${result.source}, ${result.matched}${conditionNote}.`,
    );

    const { headers } = await verifiedRow(ctx);
    await writeCells(
      ctx.token,
      ctx.sheetId,
      category.name,
      item.sheet_row!,
      itemCells(category, headers, { marketValue: result.value, lastChecked: today, notes }),
    );

    await supabase
      .from("items")
      .update({ market_value: result.value, last_checked: today, value_status: "verified", notes })
      .eq("id", id);
    await supabase.from("price_checks").insert({
      item_id: id,
      user_id: user.id,
      value: result.value,
      method: "tcgplayer",
      sources: [{ url: result.url, label: result.source }],
      summary: `${result.source}, ${result.matched}.`,
    });

    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e, "Couldn't check the price.");
  }
}
