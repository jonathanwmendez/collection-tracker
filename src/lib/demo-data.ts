// Sample collection for the public demo (/demo). Names are real collectibles; values, dates, and
// histories are made up, generated from a fixed seed so the demo looks the same on every load.

import { toItem, type Item } from "./collection";
import type { Check } from "./movers";

type Seed = {
  category: string;
  name: string;
  details: Record<string, string>;
  condition: string;
  quantity?: number;
  value: number | null;
  paid?: number;
  status?: Item["status"];
  sold?: [number, number]; // [sale price, days ago]
  psa?: [number | null, number | null];
  checked?: number | null; // days ago, null = still an estimate
  noData?: boolean;
  trend?: number; // total change over the history, as a fraction (0.2 = +20%)
};

const SEEDS: Seed[] = [
  { category: "Pokémon", name: "Charizard", details: { Set: "Base Set", "Card #": "4/102", Rarity: "Holo Rare", Variant: "Holo" }, condition: "LP", value: 365, paid: 120, psa: [1450, 6200], checked: 3, trend: 0.18 },
  { category: "Pokémon", name: "Blastoise", details: { Set: "Base Set", "Card #": "2/102", Rarity: "Holo Rare", Variant: "Holo" }, condition: "MP", value: 118, paid: 60, checked: 12, trend: 0.06 },
  { category: "Pokémon", name: "Pikachu", details: { Set: "Base Set", "Card #": "58/102", Rarity: "Common", Variant: "Non-Holo" }, condition: "NM", quantity: 3, value: 2.5, paid: 0.5, checked: 20 },
  { category: "Pokémon", name: "Umbreon VMAX", details: { Set: "Evolving Skies", "Card #": "215/203", Rarity: "Secret Rare", Variant: "Holo" }, condition: "NM", value: 1180, paid: 640, psa: [1500, 2900], checked: 2, trend: 0.24 },
  { category: "Magic: The Gathering", name: "Sol Ring", details: { Set: "Commander Masters", "Collector #": "410", Finish: "Non-foil" }, condition: "NM", quantity: 4, value: 1.6, checked: 9 },
  { category: "Magic: The Gathering", name: "The One Ring", details: { Set: "The Lord of the Rings: Tales of Middle-earth", "Collector #": "246", Finish: "Non-foil" }, condition: "NM", value: 58, paid: 75, checked: 5, trend: -0.22 },
  { category: "Magic: The Gathering", name: "Ragavan, Nimble Pilferer", details: { Set: "Modern Horizons 2", "Collector #": "138", Finish: "Non-foil" }, condition: "LP", value: 46, paid: 70, checked: 41, trend: -0.15 },
  { category: "Magic: The Gathering", name: "Rhystic Study", details: { Set: "Prophecy", "Collector #": "45", Finish: "Non-foil" }, condition: "MP", value: 34, paid: 12, checked: 7, trend: 0.1 },
  { category: "Yu-Gi-Oh!", name: "Blue-Eyes White Dragon", details: { Set: "Legend of Blue Eyes White Dragon", "Set Code": "LOB-001", Rarity: "Ultra Rare", Edition: "Unlimited" }, condition: "LP", value: 88, psa: [260, 900], checked: 6, trend: 0.05 },
  { category: "Yu-Gi-Oh!", name: "Dark Magician", details: { Set: "Starter Deck: Yugi", "Set Code": "SDY-006", Rarity: "Ultra Rare", Edition: "Unlimited" }, condition: "NM", value: 12, checked: 15 },
  { category: "Sports Cards", name: "Michael Jordan", details: { Year: "1990", "Brand / Set": "Fleer", "Card #": "26", "Parallel / Variant": "Base", Grade: "" }, condition: "Raw", value: 22, paid: 8, psa: [95, 610], checked: 4, trend: 0.08 },
  { category: "Sports Cards", name: "Ken Griffey Jr.", details: { Year: "1989", "Brand / Set": "Upper Deck", "Card #": "1", "Parallel / Variant": "Base", Grade: "PSA 8" }, condition: "Graded", value: 135, paid: 90, checked: 11, trend: -0.04 },
  { category: "Sports Cards", name: "Victor Wembanyama", details: { Year: "2023", "Brand / Set": "Panini Prizm", "Card #": "136", "Parallel / Variant": "Silver", Grade: "" }, condition: "Raw", value: 210, paid: 260, psa: [320, 640], checked: 1, trend: -0.3 },
  { category: "Sports Cards", name: "Derek Jeter", details: { Year: "1993", "Brand / Set": "Upper Deck SP", "Card #": "279", "Parallel / Variant": "Foil", Grade: "" }, condition: "Raw", value: 190, status: "Sold", paid: 85, sold: [240, 18], checked: 25 },
  { category: "Figures", name: "Michael Jordan Triple Play", details: { "Line / Brand": "Playmates Space Jam", Year: "1996" }, condition: "In Box", value: 22, paid: 5, checked: 1 },
  { category: "Figures", name: "Boba Fett", details: { "Line / Brand": "Kenner Star Wars", Year: "1979" }, condition: "Loose", value: 74, checked: 33, trend: 0.03 },
  { category: "Figures", name: "Optimus Prime", details: { "Line / Brand": "Hasbro Transformers G1", Year: "1984" }, condition: "Loose", value: 95, paid: 40, status: "Sell", checked: 8 },
  { category: "Magazines", name: "Sports Illustrated", details: { Issue: "Vol. 80 No. 1", Date: "1994-01-10", "Cover / Feature": "Michael Jordan retires" }, condition: "Good", value: 18, checked: 14 },
  { category: "Magazines", name: "Nintendo Power", details: { Issue: "Issue 1", Date: "1988-07", "Cover / Feature": "Super Mario Bros. 2" }, condition: "Very Good", value: 145, paid: 30, checked: 6, trend: 0.12 },
  { category: "Newspapers", name: "The Philadelphia Inquirer", details: { Date: "2018-02-05", Headline: "Super Bowl champions" }, condition: "Near Mint", value: 25, checked: 40 },
  { category: "Newspapers", name: "The New York Times", details: { Date: "1969-07-21", Headline: "Men walk on moon" }, condition: "Good", value: 60, noData: true, checked: 22 },
  { category: "Ornaments", name: "Millennium Falcon", details: { "Brand / Series": "Hallmark Keepsake", Year: "1996" }, condition: "In Box", value: 42, paid: 24, checked: 10 },
  { category: "Ornaments", name: "Starship Enterprise", details: { "Brand / Series": "Hallmark Keepsake", Year: "1991" }, condition: "No Box", value: 28, checked: null },
  { category: "Other", name: "Super Mario 64", details: { Type: "Video game (N64, cartridge)", Year: "1996" }, condition: "Used", value: 32, paid: 15, checked: 9 },
];

// Dates are relative to today, so the demo never looks out of date.
const NOW = (() => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
})();
const isoDay = (daysAgo: number) => new Date(NOW - daysAgo * 86400000).toISOString().slice(0, 10);

/** A small fixed-seed random number generator, so the demo is the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function build() {
  const rand = rng(7);
  const items: Item[] = [];
  const checks: Check[] = [];

  SEEDS.forEach((s, n) => {
    const id = `demo-${n + 1}`;
    const checked = s.checked === undefined ? 10 : s.checked;
    const notes =
      checked === null
        ? `[Estimate $${s.value}, not verified yet]`
        : s.noData
          ? `Price check ${isoDay(checked)}: no reliable sold data, value is an estimate.`
          : `Verified $${s.value} on ${isoDay(checked)}: median of ${5 + (n % 6)} sold (eBay sold, 130point).`;
    items.push(
      toItem({
        id,
        category: s.category,
        name: s.name,
        details: s.details,
        condition: s.condition,
        quantity: s.quantity ?? 1,
        market_value: s.value,
        value_status: checked === null ? "estimate" : s.noData ? "unverifiable" : "verified",
        last_checked: checked === null ? null : isoDay(checked),
        status: s.status ?? "Keep",
        notes,
        sheet_row: n + 2,
        updated_at: new Date(NOW).toISOString(),
        photos: [],
        paid: s.paid ?? null,
        sold_price: s.sold?.[0] ?? null,
        sold_on: s.sold ? isoDay(s.sold[1]) : null,
        psa9: s.psa?.[0] ?? null,
        psa10: s.psa?.[1] ?? null,
      }),
    );

    // Price history: an estimate about 85 days ago, then a check every 30 days drifting toward today's value.
    if (s.value !== null) {
      const trend = s.trend ?? 0;
      const start = s.value / (1 + trend);
      checks.push({ item_id: id, value: Math.round(start * (0.9 + rand() * 0.2) * 100) / 100, checked_at: new Date(NOW - 85 * 86400000).toISOString() });
      [60, 30].filter((d) => d > (checked ?? 2)).forEach((d, k) => {
        const v = start + (s.value! - start) * ((k + 1) / 3) + (rand() - 0.5) * s.value! * 0.04;
        checks.push({ item_id: id, value: Math.round(v * 100) / 100, checked_at: new Date(NOW - d * 86400000).toISOString() });
      });
      checks.push({ item_id: id, value: s.value, checked_at: new Date(NOW - (checked ?? 2) * 86400000).toISOString() });
    }
  });
  return { items, checks };
}

export const DEMO = build();

/** 90 days of daily totals, rebuilt from the price histories so the chart matches the items. */
export function demoSnapshots() {
  const owned = DEMO.items.filter((i) => i.status !== "Sold");
  const valueOn = (item: Item, day: string) => {
    const before = DEMO.checks
      .filter((c) => c.item_id === item.id && c.checked_at.slice(0, 10) <= day && c.value !== null)
      .sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0];
    return before ? before.value! : null;
  };
  const out: Array<{ taken_on: string; total_value: number; by_category: Record<string, number> }> = [];
  for (let d = 85; d >= 0; d--) {
    const day = isoDay(d);
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const i of owned) {
      const v = valueOn(i, day);
      if (v === null) continue;
      total += v * i.quantity;
      byCategory[i.category] = Math.round(((byCategory[i.category] ?? 0) + v * i.quantity) * 100) / 100;
    }
    out.push({ taken_on: day, total_value: Math.round(total * 100) / 100, by_category: byCategory });
  }
  return out;
}

export const DEMO_NOW = NOW;
