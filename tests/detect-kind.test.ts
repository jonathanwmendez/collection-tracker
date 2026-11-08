import assert from "node:assert/strict";
import { test } from "node:test";
import { detectKind } from "../src/lib/card-text";

const L = (...t: string[]) => t.map((text, i) => ({ text, height: 20, y: i * 30 }));

test("recognizes a Pokémon card from its front", () => {
  assert.equal(detectKind(L("Basic", "Pikachu HP 60", "Thunder Jolt 30", "weakness x2 resistance retreat", "Illus. Mitsuhiro Arita", "58/102 ©1999 Nintendo, Creatures, GAME FREAK")), "pokemon");
});

test("recognizes a Magic card from its front", () => {
  assert.equal(detectKind(L("Lightning Bolt", "Instant", "Lightning Bolt deals 3 damage to any target.", "0141 C", "M10 • EN Illus. Christopher Moeller", "™ & © 2009 Wizards of the Coast")), "magic");
});

test("recognizes a Yu-Gi-Oh! card from its front", () => {
  assert.equal(detectKind(L("Dark Magician", "[Spellcaster/Normal]", "LOB-005", "ATK/2500 DEF/2100", "1st Edition", "©1996 KAZUKI TAKAHASHI ©2002 KONAMI")), "yugioh");
});

test("recognizes a sports card from its back", () => {
  assert.equal(detectKind(L("No. 189", "CAL RIPKEN JR.", "SHORTSTOP", "HT: 6'4\" WT: 220 BATS: RIGHT THROWS: RIGHT", "YR TEAM G AB R H HR RBI AVG", "© 1991 THE TOPPS COMPANY, INC.", "MLBPA")), "sports");
});

test("is unsure when there is little text", () => {
  assert.equal(detectKind(L("Ken Griffey Jr.")), null);
  assert.equal(detectKind([]), null);
});
