import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { categoryByName } from "@/lib/categories";
import { askingPrice } from "@/lib/ebay";
import type { Candidate } from "@/lib/identify";
import { saveScan, ScanError } from "@/lib/scan";

export const maxDuration = 60;

const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const file = (v: unknown) => {
  const o = v as { id?: unknown; url?: unknown } | null;
  const id = text(o?.id, 100);
  return /^[\w-]{20,}$/.test(id) ? { id, url: `https://drive.google.com/file/d/${id}/view` } : undefined;
};

/** Saves a scanned item to the sheet and the app, with its photos and free price. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the scan.", 400);
  }

  const raw = (body.candidate ?? {}) as Record<string, unknown>;
  const category = categoryByName(text(raw.category));
  if (!category) return jsonError("Pick a category.", 400);
  const rawDetails = (raw.details && typeof raw.details === "object" ? raw.details : {}) as Record<string, unknown>;
  const price = raw.price as { value?: unknown; source?: unknown; matched?: unknown } | null;
  const value = Number(price?.value);
  const candidate: Candidate = {
    category: category.name,
    name: text(raw.name) || (category.backPhoto ? "Unidentified card" : "Unidentified item"),
    details: Object.fromEntries(category.fields.slice(1).map((f) => [f, text(rawDetails[f])])),
    catalogId: text(raw.catalogId, 100),
    price: price && Number.isFinite(value) && value > 0 ? { value: Math.round(value * 100) / 100, source: text(price.source, 120), matched: text(price.matched, 200) } : null,
    label: text(raw.label),
    confidence: raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low",
    problem: text(raw.problem, 200),
    condition: text(raw.condition, 60),
    authenticator: text(raw.authenticator, 120),
    certNumber: text(raw.certNumber, 60),
  };

  try {
    // Sports cards have no free card database; use typical asking prices from eBay listings when connected.
    const asking = !candidate.price && category.name === "Sports Cards" && !candidate.name.startsWith("Unidentified") ? await askingPrice(candidate).catch(() => null) : null;
    const result = await saveScan(auth.supabase, auth.user.id, {
      candidate,
      condition: text(body.condition, 60),
      location: text(body.location, 120),
      photos: { front: file(body.front), back: file(body.back), coa: file(body.coa) },
      authenticator: text(body.authenticator, 120),
      certNumber: text(body.certNumber, 60),
      asking,
    });
    return NextResponse.json({ ...result, price: candidate.price?.value ?? asking?.value ?? null });
  } catch (e) {
    if (e instanceof ScanError) return jsonError(e.message, e.status);
    return errorResponse(e, "Couldn't save the item.");
  }
}
