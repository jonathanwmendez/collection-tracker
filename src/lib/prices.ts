// Free market prices for card games, no Claude usage needed:
// - Magic: The Gathering: Scryfall (TCGplayer market prices, updated daily)
// - Pokémon: Pokémon TCG API (TCGplayer market prices)
// - Yu-Gi-Oh!: YGOPRODeck (per-printing set prices)
// These are near-mint market prices. Sports cards and everything else are priced by Claude's scheduled check.

type Fetch = typeof fetch;

export type PriceFound = {
  found: true;
  value: number;
  /** Where the number comes from, for the notes: "TCGplayer market price via Scryfall". */
  source: string;
  /** The printing that matched, like "Sol Ring, Commander 2021 #263 (Non-foil)". */
  matched: string;
  url: string;
};
export type PriceMissing = { found: false; reason: string };
export type PriceResult = PriceFound | PriceMissing;

export type CardInput = { category: string; name: string; details: Record<string, string> };

export const PRICE_CATEGORIES = ["Magic: The Gathering", "Pokémon", "Yu-Gi-Oh!"];
export const canCheckPrice = (category: string) => PRICE_CATEGORIES.includes(category);

const UA = { "user-agent": "CollectionTracker/1.0 (personal collection app)", accept: "application/json" };

async function getJson<T>(f: Fetch, url: string, headers: Record<string, string> = UA): Promise<{ status: number; body: T | null }> {
  const res = await f(url, { headers, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, body };
}

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? round(n) : null;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function lookupCardPrice(card: CardInput, f: Fetch = fetch): Promise<PriceResult> {
  switch (card.category) {
    case "Magic: The Gathering":
      return scryfall(card, f);
    case "Pokémon":
      return pokemon(card, f);
    case "Yu-Gi-Oh!":
      return yugioh(card, f);
    default:
      return { found: false, reason: "Free price lookups only cover Magic, Pokémon, and Yu-Gi-Oh! cards." };
  }
}

// ---------- Magic: The Gathering (Scryfall) ----------

type ScryCard = {
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  prices: { usd: string | null; usd_foil: string | null; usd_etched: string | null };
  purchase_uris?: { tcgplayer?: string };
  scryfall_uri: string;
};

let setCache: { at: number; sets: Array<{ code: string; name: string }> } | null = null;

async function scryfallSetCode(set: string, f: Fetch): Promise<string | null> {
  const s = set.trim();
  if (!s) return null;
  if (!setCache || Date.now() - setCache.at > 86400000) {
    const { body } = await getJson<{ data: Array<{ code: string; name: string }> }>(f, "https://api.scryfall.com/sets");
    setCache = { at: Date.now(), sets: body?.data ?? [] };
  }
  const sets = setCache.sets;
  const lower = s.toLowerCase();
  return (
    sets.find((x) => x.code === lower)?.code ??
    sets.find((x) => norm(x.name) === norm(s))?.code ??
    sets.find((x) => norm(x.name).includes(norm(s)))?.code ??
    null
  );
}

async function scryfall(card: CardInput, f: Fetch): Promise<PriceResult> {
  const number = (card.details["Collector #"] ?? "").trim().replace(/^#/, "").split("/")[0]!.trim();
  const code = await scryfallSetCode(card.details["Set"] ?? "", f);

  let found: ScryCard | null = null;
  if (code && number) {
    const r = await getJson<ScryCard>(f, `https://api.scryfall.com/cards/${code}/${encodeURIComponent(number.toLowerCase())}`);
    if (r.status === 200 && r.body) found = r.body;
  }
  if (!found) {
    const params = new URLSearchParams({ exact: card.name });
    if (code) params.set("set", code);
    const r = await getJson<ScryCard>(f, `https://api.scryfall.com/cards/named?${params}`);
    if (r.status === 200 && r.body) found = r.body;
  }
  if (!found) {
    const r = await getJson<ScryCard>(f, `https://api.scryfall.com/cards/named?${new URLSearchParams({ fuzzy: card.name })}`);
    if (r.status === 200 && r.body) found = r.body;
  }
  if (!found) return { found: false, reason: "Scryfall has no card by that name. Check the spelling." };

  const finish = (card.details["Finish"] ?? "").toLowerCase();
  const key = finish.includes("etched") ? "usd_etched" : finish.includes("foil") ? "usd_foil" : "usd";
  const value = num(found.prices[key]);
  const label = key === "usd_etched" ? "Etched" : key === "usd_foil" ? "Foil" : "Non-foil";
  const matched = `${found.name}, ${found.set_name} #${found.collector_number} (${label})`;
  if (value === null) return { found: false, reason: `Scryfall has no ${label.toLowerCase()} price for ${matched}.` };
  return {
    found: true,
    value,
    source: "TCGplayer market price via Scryfall",
    matched,
    url: found.purchase_uris?.tcgplayer ?? found.scryfall_uri,
  };
}

// ---------- Pokémon (Pokémon TCG API) ----------

type PokePrice = { market?: number | null; mid?: number | null };
type PokeCard = {
  name: string;
  number: string;
  rarity?: string;
  set: { name: string };
  tcgplayer?: { url?: string; prices?: Record<string, PokePrice> };
};

const quoteQ = (s: string) => `"${s.replace(/["\\]/g, "").trim()}"`;

async function pokemon(card: CardInput, f: Fetch): Promise<PriceResult> {
  const headers: Record<string, string> = { ...UA };
  if (process.env.POKEMONTCG_API_KEY) headers["x-api-key"] = process.env.POKEMONTCG_API_KEY;
  const set = (card.details["Set"] ?? "").trim();
  const number = (card.details["Card #"] ?? "").trim().replace(/^#/, "").split("/")[0]!.trim();

  const attempts = [
    [`name:${quoteQ(card.name)}`, set && `set.name:${quoteQ(set)}`, number && `number:${quoteQ(number)}`],
    [`name:${quoteQ(card.name)}`, set && `set.name:${quoteQ(set)}`],
    [`name:${quoteQ(card.name)}`, number && `number:${quoteQ(number)}`],
  ];
  let cards: PokeCard[] = [];
  for (const parts of attempts) {
    const q = parts.filter(Boolean).join(" ");
    const r = await getJson<{ data?: PokeCard[] }>(f, `https://api.pokemontcg.io/v2/cards?${new URLSearchParams({ q, pageSize: "10" })}`, headers);
    if (r.status === 429) return { found: false, reason: "The Pokémon TCG API is rate limiting requests. Try again later." };
    cards = r.body?.data ?? [];
    if (cards.length) break;
  }
  if (!cards.length) return { found: false, reason: "The Pokémon TCG API has no card with that name, set, and number." };

  const priced = cards.find((c) => c.tcgplayer?.prices && Object.keys(c.tcgplayer.prices).length) ?? cards[0]!;
  const prices = priced.tcgplayer?.prices ?? {};
  const variant = (card.details["Variant"] ?? "").toLowerCase();
  const prefer = variant.includes("reverse")
    ? ["reverseHolofoil"]
    : variant.includes("1st")
      ? ["1stEditionHolofoil", "1stEditionNormal"]
      : variant.includes("holo") && !variant.includes("non")
        ? ["holofoil", "unlimitedHolofoil"]
        : variant.includes("non")
          ? ["normal", "unlimited"]
          : [];
  const order = [...prefer, "normal", "holofoil", "reverseHolofoil", "unlimitedHolofoil", "1stEditionHolofoil", "1stEditionNormal"];
  const key = order.find((k) => num(prices[k]?.market ?? prices[k]?.mid) !== null);
  const matched = `${priced.name}, ${priced.set.name} #${priced.number}`;
  if (!key) return { found: false, reason: `No TCGplayer price is listed for ${matched}.` };
  if (prefer.length && !prefer.includes(key)) {
    return { found: false, reason: `TCGplayer has no ${card.details["Variant"]} price for ${matched}.` };
  }
  const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  return {
    found: true,
    value: num(prices[key]!.market ?? prices[key]!.mid)!,
    source: "TCGplayer market price via the Pokémon TCG API",
    matched: `${matched} (${label})`,
    url: priced.tcgplayer?.url ?? "https://www.tcgplayer.com",
  };
}

// ---------- Yu-Gi-Oh! (YGOPRODeck) ----------

type YgoSet = { set_name: string; set_code: string; set_rarity: string; set_price: string };
type YgoCard = { name: string; card_sets?: YgoSet[]; card_prices?: Array<{ tcgplayer_price?: string }>; ygoprodeck_url?: string };

async function yugioh(card: CardInput, f: Fetch): Promise<PriceResult> {
  let r = await getJson<{ data?: YgoCard[] }>(f, `https://db.ygoprodeck.com/api/v7/cardinfo.php?${new URLSearchParams({ name: card.name })}`);
  if (!r.body?.data?.length) {
    r = await getJson<{ data?: YgoCard[] }>(f, `https://db.ygoprodeck.com/api/v7/cardinfo.php?${new URLSearchParams({ fname: card.name })}`);
  }
  const found = r.body?.data?.[0];
  if (!found) return { found: false, reason: "YGOPRODeck has no card by that name. Check the spelling." };

  const code = (card.details["Set Code"] ?? "").trim().toLowerCase();
  const setName = norm(card.details["Set"] ?? "");
  const rarity = norm(card.details["Rarity"] ?? "");
  const sets = found.card_sets ?? [];
  const printing =
    (code && sets.find((s) => s.set_code.toLowerCase() === code && (!rarity || norm(s.set_rarity) === rarity))) ||
    (code && sets.find((s) => s.set_code.toLowerCase() === code)) ||
    (setName && sets.find((s) => norm(s.set_name) === setName && (!rarity || norm(s.set_rarity) === rarity))) ||
    (setName && sets.find((s) => norm(s.set_name) === setName)) ||
    null;

  const url = found.ygoprodeck_url ?? "https://ygoprodeck.com";
  if (printing) {
    const value = num(printing.set_price);
    const matched = `${found.name}, ${printing.set_name} ${printing.set_code} (${printing.set_rarity})`;
    if (value === null) return { found: false, reason: `No price is listed for ${matched}.` };
    return { found: true, value, source: "set price via YGOPRODeck", matched, url };
  }
  if (code || setName) {
    return { found: false, reason: "YGOPRODeck doesn't list that set code for this card. Check the Set Code." };
  }
  const value = num(found.card_prices?.[0]?.tcgplayer_price);
  if (value === null) return { found: false, reason: `No price is listed for ${found.name}.` };
  return { found: true, value, source: "TCGplayer price (cheapest printing) via YGOPRODeck", matched: found.name, url };
}
