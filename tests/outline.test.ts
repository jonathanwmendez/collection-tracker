import assert from "node:assert/strict";
import { test } from "node:test";
import { detectItem } from "../src/lib/outline";

const W = 120;
const H = 200;

/** A plain gray surface with an optional card: light, with a border and some printed lines. */
function picture(card?: { x: number; y: number; w: number; h: number }, noise = 2, busy = false) {
  const g = new Uint8ClampedArray(W * H);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 70 + rand() * noise;
      if (busy) v += ((x >> 1) + (y >> 1)) % 2 ? 60 : -40;
      if (card && x >= card.x && x < card.x + card.w && y >= card.y && y < card.y + card.h) {
        const ix = x - card.x;
        const iy = y - card.y;
        v = 225;
        if (ix < 3 || iy < 3 || ix >= card.w - 3 || iy >= card.h - 3) v = 40; // border
        else if (iy % 9 < 2 && ix > 6 && ix < card.w - 6) v = 30; // printed lines
      }
      g[y * W + x] = v;
    }
  return g;
}

test("outlines a card on a plain surface", () => {
  const card = { x: 25, y: 40, w: 70, h: 100 };
  const box = detectItem(picture(card), W, H);
  assert.ok(box, "found the card");
  assert.ok(Math.abs(box.x - card.x) <= 3 && Math.abs(box.y - card.y) <= 3, `top left ${box.x},${box.y}`);
  assert.ok(Math.abs(box.w - card.w) <= 5 && Math.abs(box.h - card.h) <= 5, `size ${box.w}x${box.h}`);
});

test("finds a card that isn't centered", () => {
  const card = { x: 10, y: 80, w: 60, h: 90 };
  const box = detectItem(picture(card), W, H);
  assert.ok(box);
  assert.ok(Math.abs(box.x - card.x) <= 3 && Math.abs(box.y - card.y) <= 3);
});

test("returns nothing for an empty surface", () => {
  assert.equal(detectItem(picture(undefined, 4), W, H), null);
});

test("returns nothing when the background is too busy to tell apart", () => {
  assert.equal(detectItem(picture(undefined, 2, true), W, H), null);
});
