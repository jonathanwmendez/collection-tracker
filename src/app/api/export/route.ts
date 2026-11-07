import { requireUser } from "@/lib/api-auth";
import { toCsv } from "@/lib/csv";
import { getItems } from "@/lib/data";
import { todayISO } from "@/lib/sheet-format";

/** Downloads the whole collection as a CSV file. */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const items = await getItems(auth.supabase);
  return new Response("﻿" + toCsv(items), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="collection-${todayISO()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
