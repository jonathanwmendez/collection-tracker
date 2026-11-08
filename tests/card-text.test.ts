import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCoa, parseMagic, parsePokemon, parseSlab, parseSportsBack, parseYugioh, type OcrLine } from "../src/lib/card-text";

// Lines as OCR returns them: text, line height in pixels, and position from the top.
const lines = (rows: Array<[string, number?]>): OcrLine[] => rows.map(([text, height = 20], i) => ({ text, height, y: i * 30 }));

test("reads a 1990 Fleer basketball back", () => {
  const back = parseSportsBack(
    lines([
      ["26", 28],
      ["MICHAEL JORDAN", 34],
      ["GUARD  CHICAGO BULLS", 18],
      ["HT: 6-6  WT: 198  BORN: 2-17-63", 14],
      ["SEASON TEAM G FG% PTS AVG", 12],
      ["© 1990 FLEER CORP. PRINTED IN U.S.A.", 12],
    ]),
  );
  assert.equal(back.player, "Michael Jordan");
  assert.equal(back.year, "1990");
  assert.equal(back.brand, "Fleer");
  assert.equal(back.number, "26");
  assert.deepEqual(back.missing, []);
});

test("reads an Upper Deck back with No. and a Jr. name", () => {
  const back = parseSportsBack(
    lines([
      ["No. 1", 18],
      ["KEN GRIFFEY JR.", 30],
      ["SEATTLE MARINERS  OUTFIELD", 16],
      ["(c) 1989 THE UPPER DECK COMPANY", 12],
    ]),
  );
  assert.equal(back.player, "Ken Griffey Jr.");
  assert.equal(back.year, "1989");
  assert.equal(back.brand, "Upper Deck");
  assert.equal(back.number, "1");
});

test("says what it couldn't read", () => {
  const back = parseSportsBack(lines([["blurry", 10], ["text", 10]]));
  assert.deepEqual(back.missing, ["player", "year", "brand", "card number"]);
});

test("reads a PSA slab label and a certificate", () => {
  assert.deepEqual(parseSlab(lines([["1989 UPPER DECK #1", 14], ["KEN GRIFFEY JR.", 14], ["NM-MT 8", 16], ["PSA 12345678", 12]])), {
    company: "PSA",
    grade: "8",
    cert: "12345678",
  });
  assert.equal(parseSlab(lines([["just a card", 10]])), null);
  assert.deepEqual(parseCoa(lines([["James Spence Authentication", 18], ["Certificate No. AB12345", 12]])), { authenticator: "JSA", cert: "AB12345" });
  assert.deepEqual(parseCoa(lines([["PSA/DNA Authentication Services", 18], ["Z 01234", 12]])), { authenticator: "PSA/DNA", cert: "Z01234" });
});

test("reads Magic, Pokémon, and Yu-Gi-Oh! fronts", () => {
  assert.deepEqual(parseMagic(lines([["Ragavan, Nimble Pilferer", 22], ["Legendary Creature - Monkey Pirate", 14], ["138/303 M", 10], ["MH2 • EN", 10]])), {
    name: "Ragavan, Nimble Pilferer",
    setCode: "mh2",
    number: "138",
  });
  assert.deepEqual(parsePokemon(lines([["Stage 2", 12], ["Charizard 120 HP", 24], ["Weakness Resistance", 10], ["4/102", 10]])), {
    name: "Charizard",
    number: "4",
    total: "102",
  });
  assert.deepEqual(parseYugioh(lines([["Blue-Eyes White Dragon", 22], ["LOB-001", 10]])), { name: "Blue-Eyes White Dragon", setCode: "LOB-001" });
  assert.equal(parseYugioh(lines([["Dark Magician", 22], ["SDY - EN006", 10]])).setCode, "SDY-EN006");
});
