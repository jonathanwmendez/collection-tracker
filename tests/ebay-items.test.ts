import assert from "node:assert/strict";
import { test } from "node:test";
import { askingPriceForItem, itemKeywords, matchingItemListings } from "../src/lib/ebay";

const listing = (title: string, value: number, currency = "USD") => ({ title, price: { value: String(value), currency } });

test("item keywords keep what identifies it and drop how it's kept", () => {
  assert.deepEqual(itemKeywords("Michael Jordan Wheaties Box (Sealed)"), ["michael", "jordan", "wheaties"]);
  assert.deepEqual(itemKeywords("Shaq Attaq Kenner Starting Lineup figure"), ["shaq", "attaq", "kenner", "starting", "lineup", "figure"]);
  assert.deepEqual(itemKeywords("Ritz Crackers 75 Years Collector's Edition Box"), ["ritz", "crackers", "75", "years"]);
  assert.deepEqual(itemKeywords("Pokémon Burger King Kid's Meal Bag"), ["pokemon", "burger", "king", "meal"]);
  assert.deepEqual(itemKeywords("The Box"), []);
});

test("item listings need most of the keywords, the year when known, and no lots", () => {
  const words = ["michael", "jordan", "wheaties"];
  const prices = matchingItemListings(words, "1996", [
    listing("1996 Michael Jordan Wheaties Box Sealed Unopened", 30),
    listing("Wheaties 1996 Jordan Box full", 26), // 2 of 3 words is enough
    listing("1996 Michael Jordan Wheaties Box lot of 5", 90), // lot
    listing("1998 Michael Jordan Wheaties Box", 20), // different year
    listing("1996 Michael Jordan Starting Lineup", 15), // only 2 of 3, but year matches: kept
    listing("1996 Michael Jordan Wheaties Box", 25, "GBP"), // not dollars
  ]);
  assert.deepEqual(prices, [30, 26, 15]);
  assert.deepEqual(matchingItemListings(words, "", [listing("Jordan Wheaties", 5), listing("Jordan card", 5)]), [5]);
});

test("asking price for an item tries without the year when the year finds too few", async () => {
  process.env.EBAY_CLIENT_ID = "test-id";
  process.env.EBAY_CLIENT_SECRET = "test-secret";
  const queries: string[] = [];
  const fake = (async (url: string) => {
    if (url.includes("/oauth2/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 7200 }));
    const q = new URL(url).searchParams.get("q") ?? "";
    queries.push(q);
    const items = q.includes("1996")
      ? [listing("1996 Michael Jordan Wheaties Box", 30)]
      : [listing("Michael Jordan Wheaties Box", 20), listing("Jordan Wheaties box sealed", 24), listing("Michael Jordan Wheaties", 40)];
    return new Response(JSON.stringify({ itemSummaries: items }));
  }) as typeof fetch;
  const res = await askingPriceForItem({ name: "Michael Jordan Wheaties Box", details: { Year: "1996" } }, fake);
  assert.deepEqual(queries, ["michael jordan wheaties 1996", "michael jordan wheaties"]);
  assert.equal(res?.value, 24);
  assert.match(res?.note ?? "", /^Asking \$24 on \d{4}-\d{2}-\d{2}: median of 3 current eBay listings \(asking prices, not sales\)\.$/);
});
