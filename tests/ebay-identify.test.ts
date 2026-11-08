import assert from "node:assert/strict";
import { test } from "node:test";
import { matchingListings, median } from "../src/lib/ebay";
import { identifyScan } from "../src/lib/identify";

const card = { name: "Michael Jordan", details: { Year: "1990", "Brand / Set": "Fleer", "Card #": "26", Grade: "" } };
const listing = (title: string, value: number) => ({ title, price: { value: String(value), currency: "USD" } });

test("keeps only raw single listings of the same card", () => {
  const prices = matchingListings(card, [
    listing("1990 Fleer #26 Michael Jordan Bulls", 22),
    listing("1990 FLEER MICHAEL JORDAN #26 NM", 25),
    listing("1990 Fleer Michael Jordan #26 PSA 8", 120), // graded
    listing("1990 Fleer Michael Jordan #26 lot of 3", 60), // lot
    listing("1991 Fleer Michael Jordan #29", 15), // different card
    listing("1990 Fleer Basketball Michael Jordan No. 26", 20),
  ]);
  assert.deepEqual(prices, [22, 25, 20]);
  assert.equal(median(prices), 22);
});

test("graded cards compare with the same grade", () => {
  const prices = matchingListings({ ...card, details: { ...card.details, Grade: "PSA 8" } }, [
    listing("1990 Fleer Michael Jordan #26 PSA 8", 120),
    listing("1990 Fleer Michael Jordan #26 PSA 9", 400),
  ]);
  assert.deepEqual(prices, [120]);
});

test("identifies a Magic card by set code and number, with its free price", async () => {
  const calls: string[] = [];
  const fake = (async (url: string) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({ id: "abc", name: "Ragavan, Nimble Pilferer", set: "mh2", set_name: "Modern Horizons 2", collector_number: "138", rarity: "mythic", released_at: "2021-06-18", prices: { usd: "46.10", usd_foil: "60" } }),
      { status: 200 },
    );
  }) as typeof fetch;
  const [c] = await identifyScan(
    { kind: "magic", front: [{ text: "Ragavan, Nimble Pilferer", height: 20, y: 0 }, { text: "138/303 M", height: 10, y: 500 }, { text: "MH2 • EN", height: 10, y: 520 }], back: [] },
    fake,
  );
  assert.equal(calls[0], "https://api.scryfall.com/cards/mh2/138");
  assert.equal(c!.name, "Ragavan, Nimble Pilferer");
  assert.equal(c!.catalogId, "scryfall:abc");
  assert.equal(c!.confidence, "high");
  assert.equal(c!.price!.value, 46.1);
});

test("a sports card back becomes a row with a Check this note when parts are missing", async () => {
  const [c] = await identifyScan({ kind: "sports", front: [], back: [{ text: "KEN GRIFFEY JR.", height: 30, y: 0 }, { text: "(c) 1989 THE UPPER DECK COMPANY", height: 10, y: 400 }] });
  assert.equal(c!.name, "Ken Griffey Jr.");
  assert.equal(c!.details["Brand / Set"], "Upper Deck");
  assert.equal(c!.problem, "couldn't read the card number from the back");
  assert.equal(c!.condition, "Raw");
});
