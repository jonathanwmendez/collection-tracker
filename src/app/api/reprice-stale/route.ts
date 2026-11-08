import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { categoryByName, nameField } from "@/lib/categories";
import { getGoogleAccessToken } from "@/lib/google";
import { cellText, colIndex, COL, type CellWrite } from "@/lib/sheet-format";
import { readTabs, writeMany } from "@/lib/sheets";
import { staleCutoff } from "@/lib/data";
import { selectAll } from "@/lib/paged";

export const maxDuration = 60;

/** Queues every item whose price is older than the repricing window for Claude's scheduled price check. */
export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  try {
    const { data: settings } = await supabase
      .from("settings")
      .select("sheet_id, reprice_after_days")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!settings?.sheet_id) return jsonError("Connect your Google Sheet in Settings first.", 400);

    const cutoff = staleCutoff(settings.reprice_after_days ?? 30);
    const items = await selectAll<{ id: string; category: string; name: string; sheet_row: number | null }>((from, to) =>
      supabase.from("items").select("id, category, name, sheet_row").lt("last_checked", cutoff).neq("status", "Sold").order("id").range(from, to),
    );
    if (items.length === 0) return NextResponse.json({ queued: 0, skipped: 0 });

    const token = await getGoogleAccessToken(user.id);
    const tabs = [...new Set(items.map((i) => i.category as string))];
    const data = await readTabs(token, settings.sheet_id, tabs);

    const writes: Array<CellWrite & { tab: string; row: number }> = [];
    const queued: string[] = [];
    let skipped = 0;
    for (const item of items) {
      const category = categoryByName(item.category);
      const tab = data[item.category];
      if (!category || !tab || !item.sheet_row) {
        skipped++;
        continue;
      }
      const nameCol = colIndex(tab.headers, nameField(category));
      const lcCol = colIndex(tab.headers, COL.lastChecked);
      const cells = tab.rows[item.sheet_row - 2] ?? [];
      if (nameCol === undefined || lcCol === undefined || cellText(cells[nameCol]) !== item.name) {
        skipped++; // the row moved; the next sync fixes it
        continue;
      }
      writes.push({ tab: item.category, row: item.sheet_row, col: lcCol, value: "" });
      queued.push(item.id);
    }
    await writeMany(token, settings.sheet_id, writes);
    if (queued.length) await supabase.from("items").update({ last_checked: null, value_status: "estimate" }).in("id", queued);
    return NextResponse.json({ queued: queued.length, skipped });
  } catch (e) {
    return errorResponse(e, "Couldn't queue the price checks.");
  }
}
