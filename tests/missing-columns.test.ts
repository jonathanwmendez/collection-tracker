import assert from "node:assert/strict";
import { test } from "node:test";
import { fillMissingColumns, type KnownItem, type SheetItem } from "../src/lib/sheet-format";

const item = (over: Partial<SheetItem> = {}): SheetItem => ({
  row: 2, category: "Other", name: "Box", details: {}, condition: "Used", quantity: 1, marketValue: 20, lastChecked: "2026-11-25",
  status: "Keep", notes: "", photoIds: ["f1"], backPhotoIds: [], valueStatus: "verified", paid: null, soldPrice: null, soldOn: null,
  psa9: null, psa10: null, location: "", catalogId: "", authenticator: "", certNumber: "", coaPhotoIds: [], ...over,
});
const known = (over: Partial<KnownItem> = {}): KnownItem => ({
  notes: "Owner note. Asking $12 on 2026-11-01: median of 5 current eBay listings (asking prices, not sales).",
  market_value: "12", last_checked: "2026-11-01", paid: "5", sold_price: null, sold_on: null, psa9: null, psa10: null,
  location: "Box 3", catalog_id: "", authenticator: "PSA", cert_number: "123", backPhotoIds: ["b1"], coaPhotoIds: ["c1"], ...over,
});
const only = (...h: string[]) => (x: string) => h.includes(x);

test("tabs with every column are left as they are", () => {
  const s = item({ notes: "Hi" });
  assert.deepEqual(fillMissingColumns(s, () => true, known(), "2026-11-25"), s);
});

test("without Notes, a price changed on the sheet becomes a hand-set price and other fields carry over", () => {
  const f = fillMissingColumns(item(), only("Market Value (Each)", "Last Checked", "Photo"), known(), "2026-11-25");
  assert.equal(f.notes, "Owner note. Set by hand to $20 on 2026-11-25.");
  assert.equal(f.paid, 5);
  assert.equal(f.location, "Box 3");
  assert.equal(f.certNumber, "123");
  assert.deepEqual(f.backPhotoIds, ["b1"]);
  assert.deepEqual(f.coaPhotoIds, ["c1"]);
});

test("without Notes, an unchanged price keeps the app's price note", () => {
  const k = known({ market_value: "20", last_checked: "2026-11-25" });
  const f = fillMissingColumns(item(), only("Photo"), k, "2026-11-25");
  assert.equal(f.notes, k.notes);
  assert.equal(f.valueStatus, "asking");
});

test("a new row without Notes is hand-set when it has a price, plain when it doesn't", () => {
  assert.equal(fillMissingColumns(item(), only(), undefined, "2026-11-25").notes, "Set by hand to $20 on 2026-11-25.");
  assert.equal(fillMissingColumns(item({ marketValue: null, lastChecked: null }), only(), undefined, "2026-11-25").notes, "");
});
