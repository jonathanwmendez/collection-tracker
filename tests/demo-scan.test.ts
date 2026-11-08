import assert from "node:assert/strict";
import { test } from "node:test";
import { demoItemFor, demoMatch } from "../src/lib/demo-scan";

const L = (...t: string[]) => t.map((text, i) => ({ text, height: 20, y: i * 30 }));

test("each sample card on the demo Scan page stands for a demo item with a price", () => {
  for (const name of ["Ken Griffey Jr.", "Charizard", "Sol Ring"]) {
    const item = demoItemFor(name);
    assert.ok(item, name);
    assert.ok(item.market_value && item.market_value > 0, `${name} has a price`);
  }
});

test("text read from a real camera matches a demo item when its name is printed", () => {
  assert.equal(demoMatch(L("KEN GRIFFEY JR.", "UPPER DECK"))?.name, "Ken Griffey Jr.");
  assert.equal(demoMatch(L("Something else entirely")), undefined);
});
