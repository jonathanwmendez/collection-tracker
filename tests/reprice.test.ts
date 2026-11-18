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

test("everything that isn't a trading card uses eBay asking prices, right away when it has no value", () => {
  const item = (notes: string, last_checked: string | null, market_value: number | null) => ({ ...card("Other", notes, last_checked), market_value });
  assert.equal(needsFreePrice(card("Figures", "", null), o), true);
  // Claude couldn't find sold data, so there's no value yet: priced now even though it was just checked.
  assert.equal(needsFreePrice(item("No reliable sold data on 2026-11-07.", "2026-11-07", null), o), true);
  assert.equal(needsFreePrice(item("Asking $12 on 2026-11-01: median.", "2026-11-01", 12), o), false);
  assert.equal(needsFreePrice(item("Asking $12 on 2026-09-01: median.", "2026-09-01", 12), o), true);
  assert.equal(needsFreePrice(item("Verified $30 on 2026-11-01: 4 eBay sales.", "2026-11-01", 30), o), false);
  assert.equal(needsFreePrice(item("Set by hand on 2026-01-01.", "2026-01-01", 30), o), false);
  assert.equal(needsFreePrice(item("Set by hand on 2026-01-01.", "2026-01-01", null), o), false);
  assert.equal(needsFreePrice(card("Figures", "", null), { ...o, ebayOn: false }), false);
});

test("unidentified rows and rows not on the sheet are skipped", () => {
  assert.equal(needsFreePrice({ ...card("Magic: The Gathering", "[Needs identifying]", null) }, o), false);
  assert.equal(needsFreePrice({ ...card("Magic: The Gathering", "", null), sheet_row: null }, o), false);
});

test("Claude-verified cards under the threshold go back to free prices once due", () => {
  const verified = (value: number, date: string) => ({ ...card("Pokémon", `Verified $${value} on ${date}: 5 sold.`, date), market_value: value });
  assert.equal(needsFreePrice(verified(4, "2026-09-01"), o), true);
  assert.equal(needsFreePrice(verified(4, "2026-11-01"), o), false);
  assert.equal(needsFreePrice(verified(40, "2026-09-01"), o), false);
  assert.equal(needsFreePrice({ ...verified(40, "2026-11-01"), category: "Figures" }, o), false);
  // Non-card prices aren't Claude's any more: once past the window they move to eBay asking prices.
  assert.equal(needsFreePrice({ ...verified(40, "2026-09-01"), category: "Figures" }, o), true);
});
