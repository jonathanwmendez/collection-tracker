import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { getGoogleAccessToken } from "@/lib/google";
import { sheetIdFrom } from "@/lib/sheet-format";
import { getTabs } from "@/lib/sheets";
import { CATEGORIES } from "@/lib/categories";

/** Saves the sheet link, the Collection Intake link, and the repricing window. Checks the sheet before saving. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the settings.", 400);
  }

  const update: Record<string, unknown> = { user_id: user.id };
  let sheetTitle: string | undefined;

  try {
    if (typeof body.sheet === "string") {
      const sheetId = sheetIdFrom(body.sheet);
      if (!sheetId) return jsonError("That doesn't look like a Google Sheets link.", 400);
      const token = await getGoogleAccessToken(user.id);
      const { title, tabs } = await getTabs(token, sheetId);
      const found = CATEGORIES.filter((c) => c.name in tabs).length;
      if (found === 0) return jsonError(`"${title}" has none of the category tabs, like Figures or Pokémon.`, 400);
      update.sheet_id = sheetId;
      update.sheet_tabs = tabs;
      sheetTitle = title;
    }
    if (typeof body.intakeUrl === "string") {
      const url = body.intakeUrl.trim();
      if (url && !/^https:\/\/claude\.ai\/(code\/)?artifact\/[\w-]+/.test(url)) {
        return jsonError("Paste the Collection Intake link from Claude. It starts with https://claude.ai/artifact/.", 400);
      }
      update.intake_url = url || null;
    }
    if (body.repriceAfterDays !== undefined) {
      const days = Math.round(Number(body.repriceAfterDays));
      if (!Number.isFinite(days) || days < 1 || days > 3650) return jsonError("Pick a number of days between 1 and 3650.", 400);
      update.reprice_after_days = days;
    }

    const { error } = await supabase.from("settings").upsert(update, { onConflict: "user_id" });
    if (error) {
      console.error("Save settings failed", error);
      return jsonError("Couldn't save the settings.", 500);
    }
    return NextResponse.json({ ok: true, sheetTitle });
  } catch (e) {
    return errorResponse(e, "Couldn't save the settings.");
  }
}
