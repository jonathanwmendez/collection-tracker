import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import type { OcrLine, ScanKind } from "@/lib/card-text";
import { identifyAuto, identifyScan } from "@/lib/identify";

export const maxDuration = 30;
const KINDS: ScanKind[] = ["sports", "magic", "pokemon", "yugioh", "other"];

const lines = (v: unknown): OcrLine[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, 200)
    .map((l) => ({ text: String(l?.text ?? "").slice(0, 300), height: Number(l?.height) || 0, y: Number(l?.y) || 0 }))
    .filter((l) => l.text.trim());

/** Works out what was scanned and matches it to free card databases. No Claude. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the scan.", 400);
  }
  const front = lines(body.front);
  const back = lines(body.back);
  // "auto" (the Scan page's default): work out what kind of card it is from the text.
  if (body.kind === "auto") {
    const hint = (["sports", "magic", "pokemon", "yugioh"] as const).find((k) => k === body.hint) ?? null;
    return NextResponse.json(await identifyAuto({ front, back, hasBack: Boolean(body.hasBack), hint }));
  }
  const kind = KINDS.includes(body.kind as ScanKind) ? (body.kind as ScanKind) : "other";
  const candidates = await identifyScan({ kind, front, back });
  return NextResponse.json({ kind, candidates });
}
