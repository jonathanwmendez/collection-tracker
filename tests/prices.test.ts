import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupCardPrice } from "../src/lib/prices";

/** A fake fetch that answers by URL prefix and records what was asked. */
function fakeFetch(routes: Array<[RegExp, number, unknown]>) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    const hit = routes.find(([re]) => re.test(String(url)));
    const [, status, body] = hit ?? [/./, 404, { object: "error" }];
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const solRing = {
  name: "Sol Ring",
  set: "c21",
  set_name: "Commander 2021",
  collector_number: "263",
  prices: { usd: "1.49", usd_foil: null, usd_etched: "3.10" },
  purchase_uris: { tcgplayer: "https://tcgplayer.example/sol-ring" },
  scryfall_uri: "https://scryfall.com/card/c21/263",
};

test("Magic: matches set name and collector number, picks the finish", async () => {
  const { f, calls } = fakeFetch([
    [/\/sets$/, 200, { data: [{ code: "c21", name: "Commander 2021" }, { code: "lea", name: "Limited Edition Alpha" }] }],
    [/\/cards\/c21\/263$/, 200, solRing],
  ]);
  const r = await lookupCardPrice({ category: "Magic: The Gathering", name: "Sol Ring", details: { Set: "Commander 2021", "Collector #": "263", Finish: "Etched" } }, f);
  assert.ok(r.found);
  assert.equal(r.value, 3.1);
  assert.match(r.matched, /Commander 2021 #263 \(Etched\)/);
  assert.equal(r.url, "https://tcgplayer.example/sol-ring");
  assert.ok(calls.some((c) => c.endsWith("/cards/c21/263")));
});

test("Magic: reports a missing foil price instead of using the non-foil one", async () => {
  const { f } = fakeFetch([
    [/\/sets$/, 200, { data: [] }],
    [/\/cards\/named\?exact=/, 200, solRing],
  ]);
  const r = await lookupCardPrice({ category: "Magic: The Gathering", name: "Sol Ring", details: { Set: "", "Collector #": "", Finish: "Foil" } }, f);
  assert.equal(r.found, false);
  assert.match(r.found ? "" : r.reason, /no foil price/);
});

test("Magic: falls back to fuzzy name search", async () => {
  const { f } = fakeFetch([
    [/\/sets$/, 200, { data: [] }],
    [/\/cards\/named\?exact=/, 404, { object: "error" }],
    [/\/cards\/named\?fuzzy=/, 200, solRing],
  ]);
  const r = await lookupCardPrice({ category: "Magic: The Gathering", name: "sol rng", details: {} }, f);
  assert.ok(r.found);
  assert.equal(r.value, 1.49);
});

test("Pokémon: uses the variant's TCGplayer market price", async () => {
  const { f, calls } = fakeFetch([
    [
      /pokemontcg\.io\/v2\/cards/,
      200,
      {
        data: [
          {
            name: "Charizard",
            number: "4",
            set: { name: "Base" },
            tcgplayer: { url: "https://tcgplayer.example/zard", prices: { holofoil: { market: 412.33, mid: 400 }, "1stEditionHolofoil": { market: 9000 } } },
          },
        ],
      },
    ],
  ]);
  const r = await lookupCardPrice({ category: "Pokémon", name: "Charizard", details: { Set: "Base", "Card #": "4/102", Variant: "Holo" } }, f);
  assert.ok(r.found);
  assert.equal(r.value, 412.33);
  assert.match(r.matched, /Holofoil/);
  const q = decodeURIComponent(calls[0]!.split("q=")[1]!.replace(/\+/g, " "));
  assert.match(q, /name:"Charizard" set\.name:"Base" number:"4"/);
});

test("Pokémon: refuses to swap in another variant's price", async () => {
  const { f } = fakeFetch([
    [/pokemontcg/, 200, { data: [{ name: "Pikachu", number: "58", set: { name: "Base" }, tcgplayer: { prices: { normal: { market: 2 } } } }] }],
  ]);
  const r = await lookupCardPrice({ category: "Pokémon", name: "Pikachu", details: { Variant: "Reverse Holo" } }, f);
  assert.equal(r.found, false);
});

test("Yu-Gi-Oh!: matches the printing by set code", async () => {
  const { f } = fakeFetch([
    [
      /ygoprodeck.*name=/,
      200,
      {
        data: [
          {
            name: "Dark Magician",
            ygoprodeck_url: "https://ygoprodeck.com/card/dark-magician",
            card_sets: [
              { set_name: "Legend of Blue Eyes White Dragon", set_code: "LOB-005", set_rarity: "Ultra Rare", set_price: "45.10" },
              { set_name: "Starter Deck: Yugi", set_code: "SDY-006", set_rarity: "Ultra Rare", set_price: "12.00" },
            ],
            card_prices: [{ tcgplayer_price: "0.25" }],
          },
        ],
      },
    ],
  ]);
  const r = await lookupCardPrice({ category: "Yu-Gi-Oh!", name: "Dark Magician", details: { "Set Code": "sdy-006", Rarity: "Ultra Rare" } }, f);
  assert.ok(r.found);
  assert.equal(r.value, 12);
  const missing = await lookupCardPrice({ category: "Yu-Gi-Oh!", name: "Dark Magician", details: { "Set Code": "XXX-001" } }, f);
  assert.equal(missing.found, false);
});

test("other categories aren't looked up", async () => {
  const r = await lookupCardPrice({ category: "Figures", name: "x", details: {} });
  assert.equal(r.found, false);
});
