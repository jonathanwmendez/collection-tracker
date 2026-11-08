// Finds the item in the camera picture, so the Scan page's frame can outline it ("auto snap").
// Works on a small grayscale copy of the picture. Pure, so it can be tested.
//
// An item held over a plain surface has many edges (its border, print, and photo) and the surface has few.
// So the columns and rows the item covers have many edge pixels: the item's box is the longest run of
// busy columns, then the longest run of busy rows within those columns. A busy background (carpet, a
// patterned table) makes everything busy, and then nothing is returned.

export type Box = { x: number; y: number; w: number; h: number };

/** Edge strength at each pixel (sum of the horizontal and vertical change). */
function edges(g: Uint8ClampedArray, w: number, h: number): Float32Array {
  const m = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      m[i] = Math.abs(g[i + 1]! - g[i - 1]!) + Math.abs(g[i + w]! - g[i - w]!);
    }
  }
  return m;
}

/** The longest run of indexes where on(i) is true, allowing small gaps. Prefers the run covering the middle. */
function longestRun(n: number, on: (i: number) => boolean, gap: number): [number, number] | null {
  const runs: Array<[number, number]> = [];
  let start = -1;
  let lastOn = -1;
  for (let i = 0; i < n; i++) {
    if (!on(i)) continue;
    if (start < 0) start = i;
    else if (i - lastOn > gap + 1) {
      runs.push([start, lastOn]);
      start = i;
    }
    lastOn = i;
  }
  if (start >= 0) runs.push([start, lastOn]);
  if (!runs.length) return null;
  const mid = n / 2;
  const covering = runs.filter(([a, b]) => a <= mid && b >= mid);
  const pool = covering.length ? covering : runs;
  return pool.reduce((best, r) => (r[1] - r[0] > best[1] - best[0] ? r : best));
}

/**
 * The item's box in the picture (in the same pixels as g), or null when there's no clear item:
 * nothing there, the item is too small, or the background is too busy to tell apart.
 */
export function detectItem(g: Uint8ClampedArray, w: number, h: number): Box | null {
  if (w < 16 || h < 16) return null;
  const m = edges(g, w, h);
  let sum = 0;
  let sq = 0;
  const n = (w - 2) * (h - 2);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const v = m[y * w + x]!;
      sum += v;
      sq += v * v;
    }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
  const t = Math.max(24, mean + sd);

  const col = new Uint16Array(w);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (m[y * w + x]! > t) col[x]!++;
  // A column or row counts as part of the item with only a few edge pixels: blank stretches inside a card
  // (a text box, a border) still have the card's own edges at either end.
  const cols = longestRun(w, (x) => col[x]! > Math.max(2, h * 0.025), Math.max(2, Math.round(w * 0.04)));
  if (!cols) return null;
  const [x0, x1] = cols;

  const row = new Uint16Array(h);
  for (let y = 1; y < h - 1; y++) for (let x = x0; x <= x1; x++) if (m[y * w + x]! > t) row[y]!++;
  const span = x1 - x0 + 1;
  const rows = longestRun(h, (y) => row[y]! >= Math.max(2, span * 0.025), Math.max(2, Math.round(h * 0.04)));
  if (!rows) return null;
  const [y0, y1] = rows;

  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  // Too small to be the item, or so big that it's probably a busy background.
  if (box.w < w * 0.2 || box.h < h * 0.2) return null;
  if (box.w > w * 0.97 && box.h > h * 0.97) return null;
  const aspect = box.h / box.w;
  if (aspect < 0.3 || aspect > 3) return null;
  return box;
}
