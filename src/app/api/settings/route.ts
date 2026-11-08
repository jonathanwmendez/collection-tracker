import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { getGoogleAccessToken } from "@/lib/google";
import { sheetIdFrom } from "@/lib/sheet-format";
import { getTabs, SUMMARY_SETTINGS, writeSummarySettings, type SummaryKey } from "@/lib/sheets";
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
    if (body.alertChangePct !== undefined) {
      const raw = String(body.alertChangePct).trim();
      const pct = raw === "" ? 0 : Math.round(Number(raw));
      if (!Number.isFinite(pct) || pct < 0 || pct > 1000) return jsonError("Pick an alert percentage between 0 and 1000. Use 0 to turn alerts off.", 400);
      update.alert_change_pct = pct;
    }
    if (body.gradingCost !== undefined) {
      const raw = String(body.gradingCost).trim();
      const cost = raw === "" ? null : Math.round(Number(raw) * 100) / 100;
      if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 100000)) return jsonError("Enter a grading cost in dollars.", 400);
      update.grading_cost = cost;
    }
    if (body.claudeThreshold !== undefined) {
      const raw = String(body.claudeThreshold).trim();
      const t = raw === "" ? 10 : Math.round(Number(raw) * 100) / 100;
      if (!Number.isFinite(t) || t < 0 || t > 1000000) return jsonError("Enter a dollar amount for Claude price checks.", 400);
      update.claude_threshold = t;
    }

    // Keep the sheet's Summary settings (read by the nightly price check) the same as the app's.
    let sheetNote: string | undefined;
    const shared: Partial<Record<SummaryKey, number | null>> = {};
    if (update.reprice_after_days !== undefined) shared.repriceAfterDays = update.reprice_after_days as number;
    if (update.alert_change_pct !== undefined) shared.alertChangePct = update.alert_change_pct as number;
    if (update.grading_cost !== undefined) shared.gradingCost = update.grading_cost as number | null;
    if (update.claude_threshold !== undefined) shared.claudeThreshold = update.claude_threshold as number;
    if (Object.keys(shared).length) {
      const sheetId =
        (update.sheet_id as string | undefined) ??
        ((await supabase.from("settings").select("sheet_id").eq("user_id", user.id).maybeSingle()).data?.sheet_id as string | undefined);
      if (sheetId) {
        const token = await getGoogleAccessToken(user.id);
        const missing = await writeSummarySettings(token, sheetId, shared);
        if (missing.length) {
          sheetNote = `Saved in the app. Your sheet's Summary tab has no ${missing.map((k) => `"${SUMMARY_SETTINGS[k]}"`).join(" or ")} row, so the price check uses its defaults.`;
        }
      }
    }

    const { error } = await supabase.from("settings").upsert(update, { onConflict: "user_id" });
    if (error) {
      console.error("Save settings failed", error);
      return jsonError("Couldn't save the settings.", 500);
    }
    return NextResponse.json({ ok: true, sheetTitle, sheetNote });
  } catch (e) {
    return errorResponse(e, "Couldn't save the settings.");
  }
}
