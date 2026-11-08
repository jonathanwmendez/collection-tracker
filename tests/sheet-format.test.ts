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
  photoSides,
  priceSource,
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
  assert.match(priceSummary("", "estimate"), /not checked/i);
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

test("reads cost, sale, and graded price columns", () => {
  const headers = readHeaders([...FIGURE_HEADERS, "Paid (Each)", "Sold For (Each)", "Sold Date"]);
  const item = parseRow("Figures", headers, [...FIGURE_ROW, 15, "$40.00", 46300], 2)!;
  assert.equal(item.paid, 15);
  assert.equal(item.soldPrice, 40);
  assert.equal(item.soldOn, "2026-10-05");
  assert.equal(item.psa9, null);
  const cells = itemCells(categoryByName("Figures")!, headers, { paid: 12.5, soldPrice: null, soldOn: "2026-11-01" });
  assert.deepEqual(cells.map((c) => [c.col, c.value]), [[12, 12.5], [13, ""], [14, "2026-11-01"]]);
});

test("reads a card's front and back photos from Photo and Back Photo", () => {
  const headers = readHeaders(["Card Name", "Set", "Card #", "Rarity", "Variant", "Condition", "Qty", "Market Value (Each)", "Total Value (Auto)", "Last Checked", "TCGplayer (Auto)", "Status", "Photo", "Notes", "Paid (Each)", "Sold For (Each)", "Sold Date", "PSA 9 (Each)", "PSA 10 (Each)", "Back Photo"]);
  const row = ["Pikachu", "Base Set", "58/102", "Common", "Non-Holo", "NM", 1, 2, "", "", "", "Keep",
    '=HYPERLINK("https://drive.google.com/file/d/FRONTfrontFRONTfront01/view","Photo")', "", "", "", "", "", "",
    '=HYPERLINK("https://drive.google.com/file/d/BACKbackBACKbackBACK02/view","Back")'];
  const item = parseRow("Pokémon", headers, row, 5)!;
  assert.deepEqual(item.photoIds, ["FRONTfrontFRONTfront01"]);
  assert.deepEqual(item.backPhotoIds, ["BACKbackBACKbackBACK02"]);
});

test("orders photos front first, then back, and labels sides only for cards", () => {
  assert.deepEqual(photoSides(["a1", "a2"], ["b1", "a1"], true), [
    { fileId: "a1", side: "front" },
    { fileId: "a2", side: "front" },
    { fileId: "b1", side: "back" },
  ]);
  assert.deepEqual(photoSides(["a1"], [], false), [{ fileId: "a1", side: null }]);
});

test("reads where a price came from and labels asking prices", () => {
  const d = "2026-11-08";
  assert.equal(priceSource(`Note. Free price $4.50 on ${d}: TCGplayer market (Scryfall).`, d), "free");
  assert.equal(valueStatusOf(d, `Free price $4.50 on ${d}: TCGplayer market (Scryfall).`), "verified");
  assert.equal(priceSource(`Asking $3 on ${d}: median of 12 eBay listings.`, d), "asking");
  assert.equal(valueStatusOf(d, `Asking $3 on ${d}: median of 12 eBay listings.`), "asking");
  // A later Claude check wins over an earlier free price.
  const both = `Asking $3 on ${d}: median of 12 eBay listings. Verified $11 on ${d}: median of 6 sold (eBay sold).`;
  assert.equal(priceSource(both, d), "claude");
  assert.equal(valueStatusOf(d, both), "verified");
  assert.equal(priceSource("anything", null), "none");
  assert.equal(stripPriceNotes(both), "");
});

test("reads location, catalog ID, and certificate columns", () => {
  const headers = readHeaders(["Name", "Line / Brand", "Year", "Condition", "Qty", "Market Value (Each)", "Total Value (Auto)", "Last Checked", "eBay Sold (Auto)", "Status", "Photo", "Notes", "Paid (Each)", "Sold For (Each)", "Sold Date", "Location", "Catalog ID", "Authenticator", "Cert Number", "COA Photo"]);
  const row = ["Signed ball", "Rawlings", "1998", "Loose", 1, "", "", "", "", "Keep", "", "", "", "", "", "Box 3", "", "PSA/DNA", "AB12345", '=HYPERLINK("https://drive.google.com/file/d/COAcoaCOAcoaCOAcoa001/view","COA")'];
  const item = parseRow("Figures", headers, row, 4)!;
  assert.equal(item.location, "Box 3");
  assert.equal(item.authenticator, "PSA/DNA");
  assert.equal(item.certNumber, "AB12345");
  assert.deepEqual(item.coaPhotoIds, ["COAcoaCOAcoaCOAcoa001"]);
  assert.deepEqual(photoSides([], [], false, item.coaPhotoIds), [{ fileId: "COAcoaCOAcoaCOAcoa001", side: "coa" }]);
});
