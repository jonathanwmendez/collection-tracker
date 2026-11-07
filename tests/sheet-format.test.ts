import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryByName } from "../src/lib/categories";
import {
  cellText,
  columnLetter,
  driveFileIds,
  itemCells,
  parseDate,
  parseMoney,
  parseRow,
  priceSummary,
  readHeaders,
  safeCell,
  sheetIdFrom,
  stripEstimateTag,
  stripPriceNotes,
  valueStatusOf,
} from "../src/lib/sheet-format";

// Headers and row exactly as the Figures tab returns them (headers formatted, data with formulas).
const FIGURE_HEADERS = ["Name", "Line / Brand", "Year", "Condition", "Qty", "Market Value (Each)", "Total Value (Auto)", "Last Checked", "eBay Sold (Auto)", "Status", "Photo", "Notes"];
const FIGURE_ROW = [
  "Michael Jordan Triple Play",
  "Playmates Space Jam",
  "1996",
  "In Box",
  1,
  22,
  "",
  46332,
  "",
  "Keep",
  '=HYPERLINK("https://drive.google.com/file/d/1E9gxW9sc4oVJmett_YNtMkLypIpZ0Ed1/view?usp=drivesdk","Photo")',
  "Stock no. 17680. Golf, basketball, and baseball figures. Box has corner wear.",
];

test("parses a real Figures row", () => {
  const item = parseRow("Figures", readHeaders(FIGURE_HEADERS), FIGURE_ROW, 2)!;
  assert.equal(item.name, "Michael Jordan Triple Play");
  assert.deepEqual(item.details, { "Line / Brand": "Playmates Space Jam", Year: "1996" });
  assert.equal(item.condition, "In Box");
  assert.equal(item.quantity, 1);
  assert.equal(item.marketValue, 22);
  assert.equal(item.lastChecked, "2026-11-06");
  assert.equal(item.status, "Keep");
  assert.deepEqual(item.photoIds, ["1E9gxW9sc4oVJmett_YNtMkLypIpZ0Ed1"]);
  assert.equal(item.row, 2);
  assert.equal(item.valueStatus, "verified");
});

test("skips blank rows and parses the Sports Cards column order", () => {
  const headers = readHeaders(["Player", "Year", "Brand / Set", "Card #", "Parallel / Variant", "Condition", "Grade", "Qty", "Market Value (Each)", "Total Value (Auto)", "Last Checked", "eBay Sold (Auto)", "Status", "Photo", "Notes"]);
  assert.equal(parseRow("Sports Cards", headers, ["", "1996"], 3), null);
  const item = parseRow("Sports Cards", headers, ["Kobe Bryant", 1996, "Topps Chrome", 138, "Refractor", "Graded", "PSA 9", "2", "$1,250.50", "", "", "", "sell", "", "[Estimate $1200, not verified yet] Nice"], 4)!;
  assert.equal(item.details["Grade"], "PSA 9");
  assert.equal(item.details["Card #"], "138");
  assert.equal(item.quantity, 2);
  assert.equal(item.marketValue, 1250.5);
  assert.equal(item.status, "Sell");
  assert.equal(item.valueStatus, "estimate");
});

test("value status follows the latest note from the price check", () => {
  assert.equal(valueStatusOf(null, "Verified $5 on 2026-01-01"), "estimate");
  assert.equal(valueStatusOf("2026-01-01", "Verified $5 on 2026-01-01: median of 6 sold."), "verified");
  assert.equal(valueStatusOf("2026-01-01", "Price check 2026-01-01: no reliable sold data, value is an estimate."), "unverifiable");
  assert.equal(valueStatusOf("2026-02-01", "Price check 2026-01-01: no reliable sold data. Verified $8 on 2026-02-01: median of 5 sold."), "verified");
  assert.equal(valueStatusOf("2026-02-01", "Anything"), "verified");
});

test("cell helpers", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(cellText('=HYPERLINK("https://x","Photo")'), "Photo");
  assert.equal(cellText(1996), "1996");
  assert.equal(parseMoney("$22.00"), 22);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseDate("2026-11-06"), "2026-11-06");
  assert.equal(parseDate(46332), "2026-11-06");
  assert.equal(parseDate(""), null);
  assert.equal(safeCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(safeCell("-5"), "-5");
  assert.equal(safeCell("+1 foil"), "'+1 foil");
  assert.equal(safeCell("Black Lotus"), "Black Lotus");
  assert.deepEqual(driveFileIds("https://drive.google.com/open?id=abcdefghijklmnopqrstuv"), ["abcdefghijklmnopqrstuv"]);
  assert.equal(sheetIdFrom("https://docs.google.com/spreadsheets/d/1BR6WHLfgeiWOjllHUZhwLBlUu_NtUQ2nl5iDSgCr2c8/edit?gid=0"), "1BR6WHLfgeiWOjllHUZhwLBlUu_NtUQ2nl5iDSgCr2c8");
  assert.equal(sheetIdFrom("not a link"), null);
});

test("notes helpers", () => {
  assert.equal(stripEstimateTag("[Estimate $22, not verified yet] Box wear."), "Box wear.");
  assert.equal(stripEstimateTag("[No estimate yet] "), "");
  assert.equal(stripEstimateTag("Plain note"), "Plain note");
  assert.equal(
    priceSummary("Box wear. Verified $22 on 2026-11-06: median of 5 sold (eBay). Extra.", "verified"),
    "Verified $22 on 2026-11-06: median of 5 sold (eBay).",
  );
  assert.match(priceSummary("", "estimate"), /estimate/);
});

test("itemCells writes only editable columns that exist, never Auto columns", () => {
  const cat = categoryByName("Figures")!;
  const cells = itemCells(cat, readHeaders(FIGURE_HEADERS), {
    name: "=evil",
    details: { "Line / Brand": "Playmates", Year: "1996" },
    condition: "Loose",
    quantity: 2,
    marketValue: 30,
    lastChecked: null,
    status: "Sell",
    notes: "n",
  });
  const byCol = Object.fromEntries(cells.map((c) => [FIGURE_HEADERS[c.col], c.value]));
  assert.deepEqual(byCol, {
    Name: "'=evil",
    "Line / Brand": "Playmates",
    Year: "1996",
    Condition: "Loose",
    Qty: 2,
    "Market Value (Each)": 30,
    "Last Checked": "",
    Status: "Sell",
    Notes: "n",
  });
  assert.ok(!cells.some((c) => /Auto/.test(FIGURE_HEADERS[c.col]!)));
});

test("stripPriceNotes keeps the owner's text and drops old results", () => {
  const notes =
    "Box has corner wear. Verified $22.50 on 2026-11-06: median of 5 sold (eBay, 130point). Price check 2026-12-07: no reliable sold data, value is an estimate. Set by hand to $30 on 2026-12-08. Keep forever.";
  assert.equal(stripPriceNotes(notes), "Box has corner wear. Keep forever.");
  assert.equal(
    stripPriceNotes("Verified $1.49 on 2026-11-06: TCGplayer market price via Scryfall, Sol Ring, Commander 2021 #263 (Non-foil), near-mint price (card is LP)."),
    "",
  );
});
