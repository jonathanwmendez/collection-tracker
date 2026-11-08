// Turns what the phone read off a card into rows the app can save, using only free sources:
// sports cards from the printed back, and Magic, Pokémon, and Yu-Gi-Oh! from their card databases.
// Nothing here calls Claude. Anything it can't identify is saved for the nightly run to look at.

import { detectKinds, parseMagic, parsePokemon, parseSlab, parseSportsBack, parseYugioh, type CardKind, type OcrLine, type ScanKind } from "./card-text";

type Fetch = typeof fetch;

export type Candidate = {
  category: string;
  name: string;
  details: Record<string, string>;
  /** The card's ID in its database ("scryfall:…", "ptcg:…", "ygo:…"), for exact prices and duplicate checks. */
  catalogId: string;
  /** A free market price from the card's database, when it has one. */
  price: { value: number; source: string; matched: string } | null;
  /** Shown in the Scan page's list. */
  label: string;
  confidence: "high" | "medium" | "low";
  /** What to check, when something couldn't be read. */
  problem: string;
  condition?: string;
  authenticator?: string;
  certNumber?: string;
};

export type ScanInput = { kind: ScanKind; front: OcrLine[]; back: OcrLine[] };

const UA = { "user-agent": "CollectionTracker/1.0 (personal collection app)", accept: "application/json" };
const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? round(n) : null;
};

async function getJson<T>(f: Fetch, url: string, headers: Record<string, string> = UA): Promise<T | null> {
  try {
    const res = await f(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function identifyScan(input: ScanInput, f: Fetch = fetch): Promise<Candidate[]> {
  switch (input.kind) {
    case "sports":
      return [sports(input)];
    case "magic":
      return magic(input, f);
    case "pokemon":
      return pokemon(input, f);
    case "yugioh":
      return yugioh(input, f);
    default:
      return [];
  }
}

/**
 * Works out what kind of card it is from the text, then matches it. Tries the likeliest kind first and
 * the next one if that finds nothing. With no clear signs, a card with a back photo is treated as a
 * sports card (they're identified from the back); anything else is left for the nightly run.
 */
export async function identifyAuto(
  input: { front: OcrLine[]; back: OcrLine[]; hasBack: boolean; hint?: CardKind | null },
  f: Fetch = fetch,
): Promise<{ kind: CardKind | null; candidates: Candidate[] }> {
  const scores = detectKinds([...input.front, ...input.back]);
  const likely = scores.filter((s) => s.score >= 2).map((s) => s.kind);
  // With no clear signs: what the Scan page's selector says, else a card with a back is a sports card.
  const fallback: CardKind[] = input.hint ? [input.hint] : input.hasBack ? ["sports"] : scores.slice(0, 1).map((s) => s.kind);
  const order: CardKind[] = likely.length ? likely.slice(0, 2) : fallback;
  for (const [i, kind] of order.entries()) {
    const candidates = await identifyScan({ kind, front: input.front, back: input.back }, f);
    const unread = kind === "sports" && candidates.every((c) => c.name === "Unidentified card");
    if (candidates.length && (!unread || i === order.length - 1)) return { kind, candidates };
  }
  return { kind: null, candidates: [] };
}

// ---------- sports cards ----------

function sports(input: ScanInput): Candidate {
  const slab = parseSlab(input.front);
  const back = parseSportsBack(input.back.length ? input.back : input.front);
  const details = {
    Year: back.year,
    "Brand / Set": back.brand,
    "Card #": back.number,
    "Parallel / Variant": "",
    Grade: slab ? `${slab.company} ${slab.grade}`.trim() : "",
  };
  const name = back.player || "Unidentified card";
  const missing = slab ? back.missing.filter((m) => m !== "player") : back.missing;
  return {
    category: "Sports Cards",
    name,
    details,
    catalogId: "",
    price: null,
    label: [name, back.year, back.brand, back.number && `#${back.number}`].filter(Boolean).join(" · "),
    confidence: missing.length === 0 ? "high" : missing.length <= 1 && back.player ? "medium" : "low",
    problem: missing.length ? `couldn't read the ${missing.join(", ")} from the back` : "",
    condition: slab ? "Graded" : "Raw",
    ...(slab ? { authenticator: slab.company, certNumber: slab.cert } : {}),
  };
}

// ---------- Magic: The Gathering (Scryfall) ----------

type ScryCard = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  released_at: string;
  prices: { usd: string | null; usd_foil: string | null };
};

function magicCandidate(c: ScryCard, confidence: Candidate["confidence"]): Candidate {
  const value = num(c.prices.usd) ?? num(c.prices.usd_foil);
  const finish = num(c.prices.usd) !== null ? "Non-foil" : "Foil";
  return {
    category: "Magic: The Gathering",
    name: c.name,
    details: { Set: c.set_name, "Collector #": c.collector_number, Finish: finish },
    catalogId: `scryfall:${c.id}`,
    price: value === null ? null : { value, source: "TCGplayer market price via Scryfall", matched: `${c.name}, ${c.set_name} #${c.collector_number} (${finish})` },
    label: `${c.name} · ${c.set_name} #${c.collector_number}`,
    confidence,
    problem: confidence === "high" ? "" : "printing not confirmed from the set code and number",
    condition: "NM",
  };
}

async function magic(input: ScanInput, f: Fetch): Promise<Candidate[]> {
  const t = parseMagic(input.front);
  if (t.setCode && t.number) {
    const c = await getJson<ScryCard>(f, `https://api.scryfall.com/cards/${encodeURIComponent(t.setCode)}/${encodeURIComponent(t.number)}`);
    if (c) return [magicCandidate(c, "high")];
  }
  if (!t.name) return [];
  const named = await getJson<ScryCard>(f, `https://api.scryfall.com/cards/named?${new URLSearchParams({ fuzzy: t.name })}`);
  if (!named) return [];
  const prints = await getJson<{ data?: ScryCard[] }>(
    f,
    `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: `!"${named.name}"`, unique: "prints", order: "released", dir: "desc" })}`,
  );
  const list = (prints?.data ?? [named]).slice(0, 3);
  return list.map((c) => magicCandidate(c, list.length === 1 ? "high" : "medium"));
}

// ---------- Pokémon (Pokémon TCG API) ----------

type PokeCard = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: { name: string; printedTotal?: number };
  tcgplayer?: { prices?: Record<string, { market?: number | null; mid?: number | null }> };
};

const POKE_PRICE_ORDER = ["holofoil", "normal", "reverseHolofoil", "unlimitedHolofoil", "1stEditionHolofoil", "1stEditionNormal", "unlimited"];

function pokemonCandidate(c: PokeCard, confidence: Candidate["confidence"]): Candidate {
  const prices = c.tcgplayer?.prices ?? {};
  const key = POKE_PRICE_ORDER.find((k) => num(prices[k]?.market ?? prices[k]?.mid) !== null);
  const value = key ? num(prices[key]!.market ?? prices[key]!.mid) : null;
  const variant = key === "reverseHolofoil" ? "Reverse Holo" : key?.startsWith("1stEdition") ? "1st Edition" : key?.toLowerCase().includes("holo") ? "Holo" : "Non-Holo";
  return {
    category: "Pokémon",
    name: c.name,
    details: { Set: c.set.name, "Card #": `${c.number}${c.set.printedTotal ? `/${c.set.printedTotal}` : ""}`, Rarity: c.rarity ?? "", Variant: variant },
    catalogId: `ptcg:${c.id}`,
    price: value === null ? null : { value, source: "TCGplayer market price via the Pokémon TCG API", matched: `${c.name}, ${c.set.name} #${c.number} (${variant})` },
    label: `${c.name} · ${c.set.name} #${c.number}`,
    confidence,
    problem: confidence === "high" ? "" : "set not confirmed from the card number",
    condition: "NM",
  };
}

async function pokemon(input: ScanInput, f: Fetch): Promise<Candidate[]> {
  const t = parsePokemon(input.front);
  if (!t.name) return [];
  const headers: Record<string, string> = { ...UA };
  if (process.env.POKEMONTCG_API_KEY) headers["x-api-key"] = process.env.POKEMONTCG_API_KEY;
  const q = (parts: string[]) => `https://api.pokemontcg.io/v2/cards?${new URLSearchParams({ q: parts.filter(Boolean).join(" "), pageSize: "3", orderBy: "-set.releaseDate" })}`;
  const name = `name:"${t.name.replace(/["\\]/g, "")}"`;
  const attempts = [
    [name, t.number && `number:${t.number}`, t.total && `set.printedTotal:${t.total}`],
    [name, t.number && `number:${t.number}`],
    [name],
  ];
  for (const parts of attempts) {
    const r = await getJson<{ data?: PokeCard[] }>(f, q(parts as string[]), headers);
    const list = r?.data ?? [];
    if (list.length) return list.map((c) => pokemonCandidate(c, list.length === 1 && t.number ? "high" : "medium"));
  }
  return [];
}

// ---------- Yu-Gi-Oh! (YGOPRODeck) ----------

type YgoSetInfo = { id: number; name: string; set_name: string; set_code: string; set_rarity: string; set_price: string };
type YgoCard = { id: number; name: string; card_sets?: Array<{ set_name: string; set_code: string; set_rarity: string; set_price: string }> };

async function yugioh(input: ScanInput, f: Fetch): Promise<Candidate[]> {
  const t = parseYugioh(input.front);
  if (t.setCode) {
    const info = await getJson<YgoSetInfo>(f, `https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?${new URLSearchParams({ setcode: t.setCode })}`);
    if (info?.name) {
      const value = num(info.set_price);
      return [
        {
          category: "Yu-Gi-Oh!",
          name: info.name,
          details: { Set: info.set_name, "Set Code": info.set_code, Rarity: info.set_rarity, Edition: "" },
          catalogId: `ygo:${info.id}:${info.set_code}`,
          price: value === null ? null : { value, source: "set price via YGOPRODeck", matched: `${info.name}, ${info.set_name} ${info.set_code} (${info.set_rarity})` },
          label: `${info.name} · ${info.set_code}`,
          confidence: "high",
          problem: "",
          condition: "NM",
        },
      ];
    }
  }
  if (!t.name) return [];
  const r = await getJson<{ data?: YgoCard[] }>(f, `https://db.ygoprodeck.com/api/v7/cardinfo.php?${new URLSearchParams({ fname: t.name })}`);
  const card = r?.data?.[0];
  if (!card) return [];
  return (card.card_sets ?? []).slice(0, 3).map((s) => {
    const value = num(s.set_price);
    return {
      category: "Yu-Gi-Oh!",
      name: card.name,
      details: { Set: s.set_name, "Set Code": s.set_code, Rarity: s.set_rarity, Edition: "" },
      catalogId: `ygo:${card.id}:${s.set_code}`,
      price: value === null ? null : { value, source: "set price via YGOPRODeck", matched: `${card.name}, ${s.set_name} ${s.set_code} (${s.set_rarity})` },
      label: `${card.name} · ${s.set_code}`,
      confidence: "medium" as const,
      problem: "printing not confirmed from the set code",
      condition: "NM",
    };
  });
}
