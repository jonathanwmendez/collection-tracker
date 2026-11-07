import assert from "node:assert/strict";
import { test } from "node:test";
import { isStale, marketLink, matchesQuery, sortItems, staleCutoff, subtitle, summarize, type Item } from "../src/lib/collection";

const base: Item = {
  id: "1",
  category: "Figures",
  name: "Michael Jordan Triple Play",
  details: { "Line / Brand": "Playmates Space Jam", Year: "1996" },
  condition: "In Box",
  quantity: 1,
  market_value: 22,
  value_status: "verified",
  last_checked: "2026-11-06",
  status: "Keep",
  notes: "Stock no. 17680",
  sheet_row: 2,
  updated_at: "",
  photos: [],
};

test("subtitle, search, links", () => {
  assert.equal(subtitle(base), "Playmates Space Jam · 1996");
  assert.ok(matchesQuery(base, "jordan 1996"));
  assert.ok(matchesQuery(base, "17680"));
  assert.ok(!matchesQuery(base, "kobe"));
  assert.match(marketLink(base).url, /ebay\.com.*LH_Sold=1/);
  assert.match(marketLink({ ...base, category: "Pokémon", name: "Charizard" }).url, /tcgplayer\.com\/search\/pokemon/);
});

test("staleness and totals", () => {
  const now = new Date("2027-03-01T12:00:00Z");
  assert.equal(staleCutoff(90, now), "2026-12-01");
  assert.ok(isStale(base, 90, now));
  assert.ok(!isStale({ last_checked: null }, 90, now));
  const items = [base, { ...base, id: "2", quantity: 3, market_value: 10, value_status: "estimate" as const, last_checked: null }];
  const t = summarize(items, 90);
  assert.equal(t.total, 52);
  assert.equal(t.verified, 22);
  assert.equal(t.pieces, 4);
  assert.equal(t.estimates, 1);
  assert.deepEqual(sortItems(items, "value").map((i) => i.id), ["2", "1"]);
  assert.deepEqual(sortItems(items, "unpriced").map((i) => i.id), ["2", "1"]);
});
