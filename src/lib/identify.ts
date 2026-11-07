import "server-only";
import { CATEGORIES, categoryByName } from "./categories";
import type { Draft } from "./types";

// Claude API model used to identify items from photos. Override with ANTHROPIC_MODEL (e.g. a cheaper Haiku model).
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

type ImageInput = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

const TOOL = {
  name: "record_item",
  description: "Record the identified collectible so it can be added to the collection.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: CATEGORIES.map((c) => c.name), description: "The tab the item belongs in." },
      fields: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Values for the chosen category's fields, keyed by field name. Use \"\" when unknown.",
      },
      condition: { type: "string", description: "One of the chosen category's condition values." },
      quantity: { type: "integer", minimum: 1 },
      estimate: { type: ["number", "null"], description: "Estimated current market value of ONE unit in USD, or null." },
      range: {
        type: ["array", "null"],
        items: { type: "number" },
        minItems: 2,
        maxItems: 2,
        description: "Likely low and high value in USD, or null.",
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      notes: { type: "string", description: "Short and factual: identifiers seen, visible wear." },
      uncertain: { type: "string", description: "What you could not confirm from the photos, or \"\"." },
      suggested_category: {
        type: "string",
        description: "If no category fits well (item placed in Other), a better category name. Otherwise \"\".",
      },
    },
    required: ["category", "fields", "condition", "quantity", "estimate", "confidence", "notes", "uncertain"],
  },
} as const;

function prompt(): string {
  const spec = CATEGORIES.map((c) => ({
    category: c.name,
    fields: c.fields,
    conditions: c.conditions,
    ...(c.suggestions ? { common_values: c.suggestions } : {}),
  }));
  return `You identify collectibles from photos for a personal collection catalog. The photos show ONE item: several photos are different angles, or the front and back of the same item.

Pick the category that fits best and fill in its fields. Categories, their fields, and their allowed condition values:
${JSON.stringify(spec, null, 1)}

Rules:
- Read every visible identifier: set names, card numbers, set codes, stock numbers, years, brands, and grades on graded slabs.
- Use "" for any field you can't determine. Never invent a card number, set code, or year.
- The condition must be one of the category's allowed values. Say in notes what you based it on.
- The estimate is your best guess of the current market value for ONE unit, based on typical recent sold prices for this exact item and condition. It will be checked against real sales later, so keep it realistic, not optimistic.
- If no category fits well, use "Other" and suggest a better category name.
- Write plainly. Do not use em dashes.

Record the item with the record_item tool.`;
}

export class IdentifyError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export async function identifyItem(images: ImageInput[]): Promise<Draft> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new IdentifyError("The Claude API key isn't set up yet. Add ANTHROPIC_API_KEY in Vercel.", 503);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } })),
            { type: "text", text: prompt() },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Claude API error", res.status, body.slice(0, 500));
    if (res.status === 401) throw new IdentifyError("The Claude API key was rejected. Check ANTHROPIC_API_KEY in Vercel.", 502);
    if (res.status === 429) throw new IdentifyError("Claude is busy or the API account is out of credit. Try again shortly.", 429);
    if (res.status === 400 && /credit|billing/i.test(body))
      throw new IdentifyError("The Claude API account needs credit. Add some under Billing in the Claude Console.", 402);
    throw new IdentifyError("Claude couldn't identify the item right now. Try again.", 502);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
  const call = data.content?.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  if (!call?.input) throw new IdentifyError("Claude didn't return an item. Try a clearer photo.", 502);
  return normalize(call.input as Record<string, unknown>);
}

/** Coerces Claude's answer into a valid draft, so the review card never shows impossible values. */
function normalize(raw: Record<string, unknown>): Draft {
  const category = categoryByName(String(raw.category)) ?? categoryByName("Other")!;
  const rawFields = (raw.fields && typeof raw.fields === "object" ? raw.fields : {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const f of category.fields) fields[f] = String(rawFields[f] ?? "").trim();

  const condition = category.conditions.includes(String(raw.condition)) ? String(raw.condition) : category.conditions[0]!;
  const quantity = Math.max(1, Math.round(Number(raw.quantity) || 1));
  const est = Number(raw.estimate);
  const estimate = Number.isFinite(est) && est > 0 ? Math.round(est * 100) / 100 : null;
  const r = Array.isArray(raw.range) ? raw.range.map(Number) : [];
  const range: [number, number] | null =
    r.length === 2 && r.every((n) => Number.isFinite(n) && n >= 0) ? [r[0]!, r[1]!] : null;
  const confidence = ["high", "medium", "low"].includes(String(raw.confidence))
    ? (String(raw.confidence) as Draft["confidence"])
    : "medium";

  return {
    category: category.name,
    fields,
    condition,
    quantity,
    estimate,
    range,
    confidence,
    notes: String(raw.notes ?? "").trim(),
    uncertain: String(raw.uncertain ?? "").trim(),
    suggestedCategory: String(raw.suggested_category ?? "").trim(),
  };
}
