import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import type { OcrLine, ScanKind } from "@/lib/card-text";
import { identifyScan } from "@/lib/identify";

export const maxDuration = 30;
const KINDS: ScanKind[] = ["sports", "magic", "pokemon", "yugioh", "other"];

const lines = (v: unknown): OcrLine[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, 200)
    .map((l) => ({ text: String(l?.text ?? "").slice(0, 300), height: Number(l?.height) || 0, y: Number(l?.y) || 0 }))
    .filter((l) => l.text.trim());

/** Matches what the phone read off a card to free card databases. No Claude. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Couldn't read the scan.", 400);
  }
  const kind = KINDS.includes(body.kind as ScanKind) ? (body.kind as ScanKind) : "other";
  const candidates = await identifyScan({ kind, front: lines(body.front), back: lines(body.back) });
  return NextResponse.json({ candidates });
}
