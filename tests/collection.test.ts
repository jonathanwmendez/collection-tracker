import assert from "node:assert/strict";
import { test } from "node:test";
import { certLookup, checkNote, gradingMath, isStale, labeledPhotos, marketLink, matchesQuery, realizedGain, sortItems, staleCutoff, subtitle, summarize, unrealizedGain, type Item } from "../src/lib/collection";

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
  paid: null,
  sold_price: null,
  sold_on: null,
  psa9: null,
  psa10: null,
  location: null,
  catalog_id: null,
  authenticator: null,
  cert_number: null,
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

test("cost, sales, and totals leave out sold items", () => {
  const owned = { ...base, quantity: 2, market_value: 30, paid: 10 };
  const sold = { ...base, id: "s", status: "Sold" as const, quantity: 1, market_value: 50, paid: 20, sold_price: 45, sold_on: "2026-10-01" };
  assert.equal(unrealizedGain(owned), 40);
  assert.equal(realizedGain(sold), 25);
  assert.equal(unrealizedGain({ ...owned, paid: null }), null);
  const t = summarize([owned, sold], 30);
  assert.equal(t.total, 60);
  assert.equal(t.items, 1);
  assert.equal(t.paid, 20);
  assert.equal(t.paidValue, 60);
  assert.equal(t.soldCount, 1);
  assert.equal(t.soldRevenue, 45);
  assert.equal(t.realized, 25);
  assert.ok(!isStale({ last_checked: "2020-01-01", status: "Sold" }, 30));
});

test("grading math", () => {
  const card = { ...base, category: "Pokémon", condition: "NM", details: { Set: "Base" }, market_value: 40, psa9: 90, psa10: 300 };
  const g = gradingMath(card, 30)!;
  assert.equal(g.gain9, 20);
  assert.equal(g.gain10, 230);
  assert.ok(g.candidate);
  assert.equal(gradingMath({ ...card, psa10: 100, psa9: 60 }, 30)!.candidate, false);
  assert.equal(gradingMath({ ...card, condition: "Graded" }, 30), null);
  assert.equal(gradingMath({ ...card, category: "Figures" }, 30), null);
  assert.equal(gradingMath({ ...card, psa9: null, psa10: null }, 30), null);
});

test("CSV export quotes text and blocks formulas", async () => {
  const { toCsv } = await import("../src/lib/csv");
  const csv = toCsv([{ ...base, notes: 'Box wear, "minor"', name: "=HYPERLINK(1)" }]);
  const [head, row] = csv.trim().split("\r\n");
  assert.ok(head!.startsWith("Category,Name,Details,Year"));
  assert.ok(row!.includes(`"Box wear, ""minor"""`));
  assert.ok(row!.includes("'=HYPERLINK(1)"));
  assert.ok(row!.includes("Line / Brand: Playmates Space Jam; Year: 1996"));
});

test("labels a card's photos Front and Back, and lists a missing back", () => {
  const photo = (id: string, position: number, side: "front" | "back" | null) => ({ id, position, drive_url: null, side });
  const both = labeledPhotos({ category: "Pokémon", photos: [photo("f", 0, "front"), photo("b", 1, "back")] });
  assert.deepEqual(both.photos.map((p) => p.label), ["Front", "Back"]);
  assert.deepEqual(both.missing, []);
  const frontOnly = labeledPhotos({ category: "Sports Cards", photos: [photo("f", 0, "front")] });
  assert.deepEqual(frontOnly.missing, ["Back"]);
  const none = labeledPhotos({ category: "Pokémon", photos: [] });
  assert.deepEqual(none.missing, []);
  const figure = labeledPhotos({ category: "Figures", photos: [photo("x", 0, null)] });
  assert.equal(figure.photos[0]!.label, undefined);
});

test("finds what Claude asked you to check in Notes", () => {
  assert.equal(checkNote({ notes: "Read from the front and back. Check this: edition not visible. Verified $12 on 2026-11-08: TCGplayer market price (TCGplayer)." }), "edition not visible");
  assert.equal(checkNote({ notes: "Check this: could be the 1st Edition printing" }), "could be the 1st Edition printing");
  assert.equal(checkNote({ notes: "Verified $12 on 2026-11-08: median of 6 sold (eBay)." }), null);
});

test("links a certificate to its lookup", () => {
  assert.equal(certLookup("PSA/DNA", "AB123")!.url, "https://www.psacard.com/cert/AB123");
  assert.equal(certLookup("Beckett (BAS)", "0001")!.url, "https://www.beckett-authentication.com/get-data/0001");
  assert.match(certLookup("JSA", "Z99")!.url, /google\.com\/search\?q=JSA%20Z99/);
  assert.equal(certLookup(null, null), null);
});
