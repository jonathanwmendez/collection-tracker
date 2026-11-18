// Typical asking prices from current eBay listings (eBay's Browse API, free with a developer account):
// sports cards, and every item that isn't a trading card. These are listings, not sales, so they're labeled
// "asking" everywhere.
// Off until EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set in Vercel.

type Fetch = typeof fetch;

export const ebayConfigured = () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

let cached: { token: string; expires: number } | null = null;

async function appToken(f: Fetch): Promise<string | null> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await f("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
  });
  if (!res.ok) {
    console.error("eBay token failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

type Summary = { title: string; price?: { value: string; currency: string } };

const GRADED = /\b(psa|bgs|sgc|cgc|beckett|graded|slab)\b/i;
const NOT_SINGLE = /\b(lot|lots|set of|bundle|pick|choose|you pick|complete set|team set|reprint|rp|custom|digital)\b/i;

/** Which listing titles count as the same card. Pure, so it can be tested. */
export function matchingListings(
  card: { name: string; details: Record<string, string> },
  items: Summary[],
): number[] {
  const last = card.name.split(" ").filter((w) => w.length > 1 && !/^(jr|sr|ii|iii)\.?$/i.test(w)).pop()?.toLowerCase() ?? "";
  const number = (card.details["Card #"] ?? "").replace(/^#/, "").trim();
  const year = (card.details["Year"] ?? "").trim();
  const grade = (card.details["Grade"] ?? "").trim();
  return items
    .filter((i) => i.price?.currency === "USD")
    .filter((i) => {
      const t = i.title.toLowerCase();
      if (last && !t.includes(last)) return false;
      if (year && !t.includes(year)) return false;
      if (number && !new RegExp(`(#|no\\.?\\s*)0*${number.replace(/[^\w]/g, "")}\\b`, "i").test(i.title)) return false;
      if (NOT_SINGLE.test(i.title)) return false;
      // Raw cards compare with raw listings; graded with the same grade.
      if (grade) return t.includes(grade.toLowerCase());
      return !GRADED.test(i.title);
    })
    .map((i) => Number(i.price!.value))
    .filter((v) => Number.isFinite(v) && v > 0);
}

export const median = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The median asking price of current listings for the same card, or null when there aren't enough. */
export async function askingPrice(
  card: { name: string; details: Record<string, string> },
  f: Fetch = fetch,
): Promise<{ value: number; note: string } | null> {
  const token = await appToken(f);
  if (!token) return null;
  const q = [card.details["Year"], card.details["Brand / Set"], card.name, card.details["Card #"] && `#${card.details["Card #"]}`, card.details["Grade"]]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({ q, category_ids: "261328", limit: "50", filter: "buyingOptions:{FIXED_PRICE}" });
  const res = await f(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: { authorization: `Bearer ${token}`, "x-ebay-c-marketplace-id": "EBAY_US" },
  });
  if (!res.ok) {
    console.error("eBay search failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const body = (await res.json()) as { itemSummaries?: Summary[] };
  const prices = matchingListings(card, body.itemSummaries ?? []);
  if (prices.length < 3) return null;
  const value = Math.round(median(prices) * 100) / 100;
  const today = new Date().toISOString().slice(0, 10);
  return { value, note: `Asking $${value} on ${today}: median of ${prices.length} current eBay listings (asking prices, not sales).` };
}

// Words that describe how an item is kept or shown rather than what it is: sellers rarely put them in titles.
const FILLER = new Set(
  "the a an and of with in on for from to by at or kid kids kid's kids' toddler mirrored framed frame print photo collage box boxes bag cup bottle can wrapper sealed used new vintage original edition collector collector's collectible collectibles commemorative all teams team".split(
    " ",
  ),
);

/** The words that identify an item in a listing title, most telling first. Pure, so it can be tested. */
export function itemKeywords(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.' ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['.]+|['.]+$/g, "").replace(/'s$/, ""))
    .filter((w) => w.length > 1 && !FILLER.has(w));
  return [...new Set(words)].slice(0, 8);
}

/**
 * Prices of listings that look like the same item: enough of its keywords in the title, the year when one is
 * known, and not a lot or bundle. Pure, so it can be tested.
 */
export function matchingItemListings(keywords: string[], year: string, items: Summary[]): number[] {
  const need = Math.max(1, Math.ceil(keywords.length * 0.6));
  return items
    .filter((i) => i.price?.currency === "USD")
    .filter((i) => {
      const t = i.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (NOT_SINGLE.test(t)) return false;
      if (year && !t.includes(year)) return false;
      return keywords.filter((k) => t.includes(k)).length >= need;
    })
    .map((i) => Number(i.price!.value))
    .filter((v) => Number.isFinite(v) && v > 0);
}

/**
 * The median asking price of current listings for any item that isn't a trading card (figures, cereal boxes,
 * board games, memorabilia), or null when fewer than 3 listings match. Tries the name with its year first,
 * then without the year, then with fewer words.
 */
export async function askingPriceForItem(
  item: { name: string; details: Record<string, string> },
  f: Fetch = fetch,
): Promise<{ value: number; note: string } | null> {
  const token = await appToken(f);
  if (!token) return null;
  const keywords = itemKeywords(item.name);
  if (!keywords.length) return null;
  const year = (item.details["Year"] ?? item.details["Date"] ?? "").match(/\b(1[89]\d\d|20\d\d)\b/)?.[1] ?? "";
  const tries: Array<[string[], string]> = [[keywords, year]];
  if (year) tries.push([keywords, ""]);
  if (keywords.length > 5) tries.push([keywords.slice(0, 5), ""]);
  for (const [words, y] of tries) {
    const q = [...words, y].filter(Boolean).join(" ");
    const params = new URLSearchParams({ q, limit: "50", filter: "buyingOptions:{FIXED_PRICE}" });
    const res = await f(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: { authorization: `Bearer ${token}`, "x-ebay-c-marketplace-id": "EBAY_US" },
    });
    if (!res.ok) {
      console.error("eBay search failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { itemSummaries?: Summary[] };
    const prices = matchingItemListings(words, y, body.itemSummaries ?? []);
    if (prices.length >= 3) {
      const value = Math.round(median(prices) * 100) / 100;
      const today = new Date().toISOString().slice(0, 10);
      return { value, note: `Asking $${value} on ${today}: median of ${prices.length} current eBay listings (asking prices, not sales).` };
    }
  }
  return null;
}
