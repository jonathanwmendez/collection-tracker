// The demo Scan page's pretend camera: a canvas video of sample cards set down on a desk, one side at a
// time, so the real scanner (outline, auto capture, reading the text) runs without a camera.
// Browser only. Nothing here is saved anywhere.

import type { OcrLine } from "./card-text";
import { DEMO } from "./demo-data";
import type { Item } from "./collection";

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
type Sample = { name: string; category: string; front: Draw; back: Draw };

const W = 1280;
const H = 720;
const CARD_W = 260;
const CARD_H = 364;

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = "#111", weight = "bold") {
  c.fillStyle = color;
  c.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  c.fillText(s, x, y);
}

/** Card backs with stats, like real sports cards, so the scanner can read them. */
function sportsBack(lines: string[]): Draw {
  return (c, w, h) => {
    c.fillStyle = "#efe6cf";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#7a5c2e";
    c.lineWidth = 6;
    c.strokeRect(8, 8, w - 16, h - 16);
    lines.forEach((l, i) => text(c, l, 20, 44 + i * 36, i === 1 ? 22 : 14, "#222", i < 2 ? "bold" : "normal"));
  };
}

/** The standard back every Pokémon card has. */
const pokemonBack: Draw = (c, w, h) => {
  c.fillStyle = "#1f4fa3";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#e33";
  c.beginPath();
  c.arc(w / 2, h / 2, 70, Math.PI, 0);
  c.fill();
  c.fillStyle = "#fff";
  c.beginPath();
  c.arc(w / 2, h / 2, 70, 0, Math.PI);
  c.fill();
  text(c, "Pokémon", w / 2 - 70, 70, 34, "#f6d33c");
};

/** The standard back every Magic card has. */
const magicBack: Draw = (c, w, h) => {
  c.fillStyle = "#5a3a1e";
  c.fillRect(0, 0, w, h);
  c.fillStyle = "#c79a5a";
  c.beginPath();
  c.ellipse(w / 2, h / 2, 90, 130, 0, 0, Math.PI * 2);
  c.fill();
  text(c, "MAGIC", w / 2 - 50, h / 2 - 10, 28, "#5a3a1e");
  text(c, "Deckmaster", w / 2 - 50, h - 40, 18, "#e8d3a8", "normal");
};

const SAMPLES: Sample[] = [
  {
    name: "Ken Griffey Jr.",
    category: "Sports Cards",
    front: (c, w, h) => {
      c.fillStyle = "#f4f1ea";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#2f5d8a";
      c.fillRect(16, 16, w - 32, h - 96);
      c.fillStyle = "#c9a04a";
      c.beginPath();
      c.arc(w / 2, h / 2 - 40, 60, 0, Math.PI * 2);
      c.fill();
      text(c, "KEN GRIFFEY JR.", 20, h - 44, 23);
      text(c, "UPPER DECK", 20, h - 18, 14, "#7a1f1f");
    },
    back: sportsBack([
      "No. 1",
      "KEN GRIFFEY JR.",
      "SEATTLE MARINERS  OUTFIELD",
      "HT: 6'3\"  WT: 195  BATS: LEFT",
      "BORN: 11-21-69  DONORA, PA",
      "YR  TEAM   G   AB   HR  RBI  AVG",
      "88  SAN BERN  58  219  11  42  .338",
      "© 1989 THE UPPER DECK COMPANY",
      "MLBPA  PRINTED IN USA",
    ]),
  },
  {
    name: "Charizard",
    category: "Pokémon",
    front: (c, w, h) => {
      c.fillStyle = "#f2d14a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#fff8e0";
      c.fillRect(12, 12, w - 24, h - 24);
      text(c, "Stage 2", 22, 40, 14, "#333", "normal");
      text(c, "Charizard", 22, 70, 28);
      text(c, "120 HP", w - 96, 70, 20, "#b3261e");
      c.fillStyle = "#e46a2e";
      c.fillRect(22, 84, w - 44, 130);
      text(c, "Fire Spin   100", 22, 250, 20);
      text(c, "weakness   resistance   retreat", 22, 300, 13, "#333", "normal");
      text(c, "Illus. Mitsuhiro Arita", 22, 326, 11, "#333", "normal");
      text(c, "4/102  ©1999 Nintendo, Creatures, GAME FREAK", 22, h - 14, 10, "#333", "normal");
    },
    back: pokemonBack,
  },
  {
    name: "Sol Ring",
    category: "Magic: The Gathering",
    front: (c, w, h) => {
      c.fillStyle = "#1b1b1b";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#c9c4b8";
      c.fillRect(14, 14, w - 28, h - 28);
      text(c, "Sol Ring", 26, 50, 26);
      c.fillStyle = "#7d6a4e";
      c.fillRect(26, 64, w - 52, 130);
      text(c, "Artifact", 26, 222, 20);
      text(c, "Tap: Add two colorless mana.", 26, 262, 15, "#111", "normal");
      text(c, "410 U  CMM • EN  Illus. Mike Bierek", 26, h - 40, 12, "#111", "normal");
      text(c, "™ & © 2023 Wizards of the Coast", 26, h - 22, 11, "#111", "normal");
    },
    back: magicBack,
  },
];

/** The demo item a sample card stands for (its price and page). */
export function demoItemFor(name: string): Item | undefined {
  const s = SAMPLES.find((x) => x.name === name);
  return s && DEMO.items.find((i) => i.name === s.name && i.category === s.category);
}

/** Matches text read from a real camera in the demo to a demo item by name, when one is printed on it. */
export function demoMatch(lines: OcrLine[]): Item | undefined {
  const all = lines.map((l) => l.text.toLowerCase()).join(" ");
  return DEMO.items
    .filter((i) => i.status !== "Sold")
    .find((i) => {
      const words = i.name
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);
      return words.length > 0 && words.every((w) => all.includes(w));
    });
}

/**
 * Starts the pretend camera. Each sample card is set down front up; once the scanner takes it, the card
 * is turned over if the scanner wants the back (wantBack), then the next one comes. showing() tells which
 * card is in view, so a scan can be matched to it.
 */
export function sampleCamera(opts: { wantBack: () => boolean; captures: () => number }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const card = document.createElement("canvas");
  card.width = CARD_W;
  card.height = CARD_H;
  const cc = card.getContext("2d")!;

  let index = 0;
  let side: "front" | "back" | null = null;
  let since = performance.now();
  let seen = opts.captures();
  let takenAt = 0;
  let offset = { x: 0, y: 0 };
  let pending: "back" | null = null;

  const desk = () => {
    c.fillStyle = "#77706a";
    c.fillRect(0, 0, W, H);
  };
  const draw = () => {
    const now = performance.now();
    // The scanner took this side: lift the card a moment later.
    if (side && opts.captures() !== seen && !takenAt) takenAt = now;
    if (side && takenAt && now - takenAt > 500) {
      const next: "back" | null = side === "front" && opts.wantBack() ? "back" : null;
      if (!next) index++;
      side = null;
      since = now;
      takenAt = 0;
      seen = opts.captures();
      pending = next;
    } else if (side && now - since > 8000) {
      // Nobody took it (auto capture off and no tap): move on.
      index++;
      side = null;
      since = now;
    }
    desk();
    if (!side && now - since > 900) {
      side = pending ?? "front";
      pending = null;
      since = now;
      seen = opts.captures();
      offset = { x: Math.round((Math.random() - 0.5) * 80), y: Math.round((Math.random() - 0.5) * 40) };
    }
    if (side) {
      const s = SAMPLES[index % SAMPLES.length]!;
      cc.clearRect(0, 0, CARD_W, CARD_H);
      (side === "back" ? s.back : s.front)(cc, CARD_W, CARD_H);
      c.drawImage(card, (W - CARD_W) / 2 + offset.x, (H - CARD_H) / 2 + offset.y);
    }
  };
  desk();
  const timer = setInterval(draw, 66);
  const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(15);
  return {
    stream,
    /** The sample card in view now, or null between cards. */
    showing: () => (side ? SAMPLES[index % SAMPLES.length]!.name : null),
    stop: () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
