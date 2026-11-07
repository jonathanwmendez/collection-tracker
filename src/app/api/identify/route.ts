import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api-auth";
import { identifyItem, IdentifyError } from "@/lib/identify";

export const maxDuration = 60;

const MAX_IMAGES = 4;
const MAX_BYTES = 1_500_000;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Receives one item's photos (already shrunk in the browser) and returns Claude's draft. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Couldn't read the photos. Try again.", 400);
  }

  const files = form.getAll("images").filter((f): f is File => f instanceof File).slice(0, MAX_IMAGES);
  if (files.length === 0) return jsonError("Add at least one photo.", 400);

  const images = [];
  for (const f of files) {
    const type = TYPES.find((t) => t === f.type);
    if (!type) return jsonError("Photos must be JPEG, PNG, WebP, or GIF.", 400);
    if (f.size > MAX_BYTES) return jsonError("A photo is too large. Try again; the app shrinks photos before sending.", 413);
    images.push({ data: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: type });
  }

  try {
    const draft = await identifyItem(images);
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof IdentifyError) return jsonError(e.message, e.status);
    console.error(e);
    return jsonError("Identification failed. Try again.", 500);
  }
}
