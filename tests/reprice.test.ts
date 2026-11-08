import assert from "node:assert/strict";
import { test } from "node:test";
import { needsFreePrice } from "../src/lib/reprice-rules";

const o = { today: "2026-11-07", cutoff: "2026-10-08", ebayOn: true };
const card = (category: string, notes: string, last_checked: string | null) => ({ category, name: "Card", notes, last_checked, sheet_row: 5 });

test("trading cards with free or no price are repriced daily", () => {
  assert.equal(needsFreePrice(card("Magic: The Gathering", "", null), o), true);
  assert.equal(needsFreePrice(card("Pokémon", "Free price $2 on 2026-11-06: TCGplayer.", "2026-11-06"), o), true);
  assert.equal(needsFreePrice(card("Pokémon", "Free price $2 on 2026-11-07: TCGplayer.", "2026-11-07"), o), false);
});

test("Claude's sold checks and hand-set prices are left alone", () => {
  assert.equal(needsFreePrice(card("Magic: The Gathering", "Verified $40 on 2026-11-01: 5 eBay sales.", "2026-11-01"), o), false);
  assert.equal(needsFreePrice(card("Yu-Gi-Oh!", "Set by hand on 2026-11-01.", "2026-11-01"), o), false);
});

test("sports cards use eBay asking prices only past the repricing window and when eBay is on", () => {
  assert.equal(needsFreePrice(card("Sports Cards", "", null), o), true);
  assert.equal(needsFreePrice(card("Sports Cards", "Asking $3 on 2026-11-01: median.", "2026-11-01"), o), false);
  assert.equal(needsFreePrice(card("Sports Cards", "Asking $3 on 2026-09-01: median.", "2026-09-01"), o), true);
  assert.equal(needsFreePrice(card("Sports Cards", "", null), { ...o, ebayOn: false }), false);
});

test("other categories and unidentified rows are skipped", () => {
  assert.equal(needsFreePrice(card("Figures", "", null), o), false);
  assert.equal(needsFreePrice({ ...card("Magic: The Gathering", "[Needs identifying]", null) }, o), false);
  assert.equal(needsFreePrice({ ...card("Magic: The Gathering", "", null), sheet_row: null }, o), false);
});
