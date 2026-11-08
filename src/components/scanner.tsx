"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { categoryByName } from "@/lib/categories";
import { subtitle } from "@/lib/collection";
import { demoItemFor, demoMatch, sampleCamera } from "@/lib/demo-scan";
import type { Candidate } from "@/lib/identify";
import { pendingScans, putScan, removeScan, type QueuedScan } from "@/lib/scan-queue";
import { detectKind, type CardKind, type OcrLine } from "@/lib/card-text";
import { detectItem } from "@/lib/outline";

// ---------- kinds of card ----------

const CATEGORY: Record<CardKind, string> = {
  sports: "Sports Cards",
  magic: "Magic: The Gathering",
  pokemon: "Pokémon",
  yugioh: "Yu-Gi-Oh!",
};
const LABEL: Record<CardKind, string> = {
  sports: "Sports card",
  magic: "Magic card",
  pokemon: "Pokémon card",
  yugioh: "Yu-Gi-Oh! card",
};
// What's being scanned. "auto" until the first card is recognized; the selector follows each scan.
type Mode = "auto" | CardKind | "item";
const MODES: Array<{ value: Mode; label: string }> = [
  { value: "auto", label: "Auto-detect" },
  { value: "sports", label: "Sports" },
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "yugioh", label: "Yu-Gi-Oh!" },
  { value: "item", label: "Other items" },
];
/** 1 photo (the front) per item, or 2 (front and back). Starts at 1; only the button changes it. */
type Sides = "front" | "both";
// Scans saved by older versions of this page named their kind up front.
const OLD_KIND: Record<string, CardKind> = {
  sports: "sports",
  magic: "magic",
  pokemon: "pokemon",
  yugioh: "yugioh",
};

// ---------- photos ----------

const SAVE_PX = 1600;
const OCR_PX = 2000;

type Rect = { x: number; y: number; w: number; h: number };
/** The camera screen: its size, and the space the top and bottom controls cover. */
type View = { sw: number; sh: number; top: number; bottom: number };

/** The frame's shape: a card upright or sideways, a graded slab, or most of the screen for other items. */
type Shape = "card" | "sideways" | "slab" | "full";
const SHAPES: Shape[] = ["card", "sideways", "slab", "full"];
const SHAPE_LABEL: Record<Shape, string> = { card: "Card", sideways: "Sideways card", slab: "Graded slab", full: "Whole item" };
// Height divided by width.
const RATIO: Record<Exclude<Shape, "full">, number> = { card: 1.4, sideways: 1 / 1.4, slab: 1.7 };

/** The frame on screen, centered in the space between the top controls (and prompt) and the bottom controls. */
function guideRect(v: View, shape: Shape = "card"): Rect {
  const bh = Math.max(1, v.sh - v.top - v.bottom);
  if (shape === "full") return { x: v.sw * 0.04, y: v.top, w: v.sw * 0.92, h: bh };
  const ratio = RATIO[shape];
  let gw = v.sw * (shape === "sideways" ? 0.92 : 0.86);
  let gh = gw * ratio;
  if (gh > bh) {
    gh = bh;
    gw = gh / ratio;
  }
  return { x: (v.sw - gw) / 2, y: v.top + (bh - gh) / 2, w: gw, h: gh };
}

/** A box a little bigger than the item, kept inside the space between the controls. */
function padBox(b: Rect, v: View): Rect {
  const px = b.w * 0.04;
  const py = b.h * 0.04;
  const x = Math.max(0, b.x - px);
  const y = Math.max(v.top, b.y - py);
  const r = Math.min(v.sw, b.x + b.w + px);
  const bottom = Math.min(v.sh - v.bottom, b.y + b.h + py);
  return { x, y, w: Math.max(1, r - x), h: Math.max(1, bottom - y) };
}

/**
 * The video fills the screen and its edges are cut off (object-cover), and it may be zoomed in on the
 * screen (zoom). This maps a rectangle on screen to the video.
 */
function toVideo(r: Rect, video: HTMLVideoElement, v: View, zoom = 1): Rect {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const k = Math.max(v.sw / vw, v.sh / vh) * zoom;
  const ox = (v.sw - vw * k) / 2;
  const oy = (v.sh - vh * k) / 2;
  const x = Math.max(0, (r.x - ox) / k);
  const y = Math.max(0, (r.y - oy) / k);
  return { x, y, w: Math.min(vw - x, r.w / k), h: Math.min(vh - y, r.h / k) };
}

async function frameToBlob(video: HTMLVideoElement, r: Rect, maxPx: number, quality = 0.82): Promise<Blob> {
  const k = Math.min(1, maxPx / Math.max(r.w, r.h));
  const c = document.createElement("canvas");
  c.width = Math.round(r.w * k);
  c.height = Math.round(r.h * k);
  c.getContext("2d")!.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality));
}

async function shrink(blob: Blob, maxPx: number, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  if (k === 1 && blob.size < 700_000) return blob;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", quality));
}

/** How sharp a grayscale image is (variance of the Laplacian). Blurry pictures score low. */
function sharpness(g: Uint8ClampedArray, w: number, h: number): number {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = g[i - w]! + g[i + w]! + g[i - 1]! + g[i + 1]! - 4 * g[i]!;
      sum += l;
      sq += l * l;
      n++;
    }
  }
  if (!n) return 0;
  const m = sum / n;
  return sq / n - m * m;
}

// ---------- reading text on the phone (tesseract.js, loaded on first use) ----------

type Worker = {
  recognize: (
    img: Blob,
    o?: object,
    out?: object,
  ) => Promise<{
    data: {
      blocks: Array<{
        paragraphs: Array<{
          lines: Array<{ text: string; bbox: { y0: number; y1: number } }>;
        }>;
      }> | null;
    };
  }>;
};
let workerPromise: Promise<Worker> | null = null;
function ocrWorker(): Promise<Worker> {
  workerPromise ??= import("tesseract.js").then(
    async (t) =>
      (await t.createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
      })) as unknown as Worker,
  );
  return workerPromise;
}
async function readText(blob: Blob | undefined): Promise<OcrLine[]> {
  if (!blob) return [];
  const worker = await ocrWorker();
  const { data } = await worker.recognize(blob, {}, { blocks: true, text: false });
  const out: OcrLine[] = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines)
        out.push({
          text: l.text.trim(),
          height: l.bbox.y1 - l.bbox.y0,
          y: l.bbox.y0,
        });
  return out.filter((l) => l.text);
}

// ---------- results ----------

type Result = {
  id: string;
  thumb: string;
  status: "waiting" | "reading" | "saving" | "saved" | "pick" | "offline" | "error";
  label: string;
  category?: string;
  detail?: string;
  price?: number | null;
  itemId?: string;
  merged?: boolean;
  candidates?: Candidate[];
  problem?: string;
  error?: string;
  backThumb?: string;
  quantity?: number;
};

const money = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Capture = {
  front?: Blob;
  frontFull?: Blob;
  back?: Blob;
  coa?: Blob;
  frontText?: OcrLine[];
  detected?: CardKind | null;
  /** What the selector said when the front was taken. */
  mode?: Mode;
  demoName?: string;
};

/**
 * The Scan page. demo: the public demo's version, which saves nothing. It shows sample cards through a
 * pretend camera unless the visitor switches to their own camera, and matches scans to the demo's items.
 */
export function Scanner({ ebayOn, intakeUrl, demo = false }: { ebayOn: boolean; intakeUrl?: string | null; demo?: boolean }) {
  // Demo: scans wait in memory instead of on the phone, and the camera can be the sample cards.
  const memQueue = useRef(new Map<string, QueuedScan>());
  const queue = useMemo(
    () =>
      demo
        ? {
            put: async (q: QueuedScan) => void memQueue.current.set(q.id, q),
            remove: async (id: string) => void memQueue.current.delete(id),
            pending: async () => [...memQueue.current.values()].sort((a, b) => a.createdAt - b.createdAt),
          }
        : { put: putScan, remove: removeScan, pending: pendingScans },
    [demo],
  );
  const [source, setSource] = useState<"sample" | "camera">(demo ? "sample" : "camera");
  const sample = useRef<ReturnType<typeof sampleCamera> | null>(null);
  const captures = useRef(0);
  const [phase, setPhase] = useState<"starting" | "camera" | "error">("starting");
  const [location, setLocation] = useState("");
  const [panel, setPanel] = useState<"settings" | "review" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  // Scans you deleted before they finished saving; the queue skips them.
  const deleted = useRef(new Set<string>());
  const settingsOpen = panel !== null;
  const setSettingsOpen = (open: boolean) => setPanel(open ? "settings" : null);
  // Auto capture: takes the photo when the item holds still. Auto snap: the frame follows the item's outline.
  const [auto, setAuto] = useState(true);
  const [outline, setOutline] = useState(true);
  const [itemBox, setItemBox] = useState<Rect | null>(null);
  const itemBoxRef = useRef<Rect | null>(null);
  itemBoxRef.current = itemBox;
  const outlineRef = useRef(outline);
  outlineRef.current = outline;
  const [step, setStep] = useState<"front" | "back">("front");
  const [mode, setMode] = useState<Mode>("auto");
  const [sides, setSides] = useState<Sides>("front");
  const [torch, setTorch] = useState<"off" | "on" | "unsupported">("unsupported");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const sidesRef = useRef(sides);
  sidesRef.current = sides;
  const [shape, setShape] = useState<Shape>("card");
  const shapeRef = useRef(shape);
  shapeRef.current = shape;
  const shapePicked = useRef(false);
  // How close auto snap is to taking the photo (0 to 1), shown on the frame.
  const [steady, setSteady] = useState(0);
  const [blurry, setBlurry] = useState(false);
  // Undo for the last photo, offered for a few seconds.
  const [retake, setRetake] = useState<"front" | "back" | null>(null);
  const retakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last photo auto snap took; cleared on retake so it can take the same view again.
  const lastSnap = useRef<Uint8ClampedArray | null>(null);
  // Zoom: the camera's own zoom when the phone allows it, otherwise the picture is enlarged on screen.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const zoomCaps = useRef<{ min: number; max: number } | null>(null);
  const [tips, setTips] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [camError, setCamError] = useState("");
  const [flash, setFlash] = useState(false);
  const [hint, setHint] = useState("");
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  viewRef.current = view;
  // Where the camera screen sits: above the bottom menu on phones, below the header on larger screens.
  const [frame, setFrame] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const bottomBar = useRef<HTMLDivElement>(null);
  const shutterRow = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const card = useRef<Capture>({});
  const stepRef = useRef(step);
  stepRef.current = step;
  const locationRef = useRef(location);
  locationRef.current = location;
  const processing = useRef(false);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // Remember the location and auto-snap setting on this phone.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("scan-session") ?? "{}");
      if (typeof s.location === "string") setLocation(s.location);
      if (typeof s.auto === "boolean") setAuto(s.auto);
      if (typeof s.outline === "boolean") setOutline(s.outline);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("scan-session", JSON.stringify({ location, auto, outline }));
    } catch {}
  }, [location, auto, outline]);

  const update = useCallback((id: string, patch: Partial<Result>) => setResults((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  // ---------- processing queue: read, identify, upload, save (one at a time, survives reloads) ----------

  const processOne = useCallback(
    async (q: QueuedScan, chosen?: Candidate): Promise<boolean> => {
      update(q.id, { status: "reading" });
      if (demo) {
        // Nothing is saved in the demo: show which demo item it matched, with its price.
        const item = q.demoName ? demoItemFor(q.demoName) : demoMatch(q.frontText ?? (await readText(await shrink(q.front, OCR_PX, 0.9)).catch(() => [])));
        update(
          q.id,
          item
            ? {
                status: "saved",
                label: [item.name, subtitle(item)].filter(Boolean).join(" · "),
                itemId: item.id,
                price: item.market_value,
                category: item.category,
                detail: "Demo: matched to a sample item. Nothing is saved.",
              }
            : { status: "saved", label: "Not in the demo's sample items", detail: "In the app, this is saved to your sheet and identified for you." },
        );
        await queue.remove(q.id);
        return true;
      }
      const old = OLD_KIND[q.kind];
      const oldItem = q.kind.startsWith("item:") ? q.kind.slice(5) : "";
      let candidate = chosen;
      if (!candidate) {
        let candidates: Candidate[] = [];
        let kind: CardKind | null = old ?? q.detected ?? null;
        if (!oldItem) {
          const front = q.frontText ?? (await readText(await shrink(q.front, OCR_PX, 0.9)).catch(() => []));
          const back = q.back ? await readText(await shrink(q.back, OCR_PX, 0.9)).catch(() => []) : [];
          const r = old
            ? await api<{ candidates: Candidate[] }>("/api/scan/identify", {
                method: "POST",
                json: { kind: old, front, back },
              })
            : await api<{ kind: CardKind | null; candidates: Candidate[] }>("/api/scan/identify", {
                method: "POST",
                json: { kind: "auto", front, back, hasBack: Boolean(q.back), hint: q.detected ?? null },
              });
          if (!r.ok) {
            update(q.id, {
              status: r.status === 0 ? "offline" : "error",
              error: r.error,
            });
            return false;
          }
          candidates = r.data.candidates;
          kind = (r.data as { kind?: CardKind | null }).kind ?? kind;
        }
        if (candidates.length > 1) {
          update(q.id, {
            status: "pick",
            candidates,
            label: candidates[0]!.label,
            category: candidates[0]!.category,
          });
          return true; // waits for you; the queue moves on
        }
        // Not recognized: saved for Claude's nightly run to identify (and move to the right tab).
        const looksLikeCard = Boolean(kind || q.back);
        candidate = candidates[0] ?? {
          category: oldItem || (kind ? CATEGORY[kind] : looksLikeCard ? "Sports Cards" : "Other"),
          name: looksLikeCard ? "Unidentified card" : "Unidentified item",
          details: {},
          catalogId: "",
          price: null,
          label: looksLikeCard ? "Couldn't read this card" : "Saved for Claude to identify tonight",
          confidence: "low",
          problem: looksLikeCard ? "the scanner couldn't read this card" : "",
        };
      }

      if (deleted.current.has(q.id)) return true;
      update(q.id, {
        status: "saving",
        label: candidate.label,
        problem: candidate.problem,
        category: candidate.category,
      });
      const isCardItem = Boolean(categoryByName(candidate.category)?.backPhoto);
      const base = [candidate.category, candidate.name, candidate.details["Year"] || candidate.details["Set"] || ""].filter(Boolean).join(" - ");
      const upload = async (blob: Blob | undefined, side: string) => {
        if (!blob) return undefined;
        const r = await api<{ id: string; url: string }>(
          `/api/scan/photo?${new URLSearchParams({ category: candidate!.category, name: `${base} - ${side}` })}`,
          {
            method: "POST",
            body: blob,
            headers: { "content-type": "image/jpeg" },
          },
        );
        if (!r.ok) throw r;
        return r.data;
      };
      try {
        const front = await upload(q.front, isCardItem ? "front" : "photo");
        const back = await upload(q.back, "back");
        const coa = await upload(q.coa, "certificate");
        const coaText = q.coa ? await readText(await shrink(q.coa, OCR_PX, 0.9)).catch(() => []) : [];
        const coaInfo = coaText.length ? (await import("@/lib/card-text")).parseCoa(coaText) : { authenticator: "", cert: "" };
        const r = await api<{
          itemId: string;
          merged: boolean;
          quantity: number;
          price: number | null;
        }>("/api/scan/save", {
          method: "POST",
          // Condition comes from the scan (Raw, Graded, or NM for cards). Change it afterward with a tap.
          json: {
            candidate,
            condition: q.condition,
            location: q.location,
            front,
            back,
            coa,
            authenticator: coaInfo.authenticator,
            certNumber: coaInfo.cert,
          },
        });
        if (!r.ok) throw r;
        update(q.id, {
          status: "saved",
          itemId: r.data.itemId,
          merged: r.data.merged,
          price: r.data.price,
          quantity: r.data.quantity,
          detail: r.data.merged ? `Already had it. Quantity is now ${r.data.quantity}.` : candidate.problem ? `Check this: ${candidate.problem}.` : "",
        });
        await queue.remove(q.id);
        return true;
      } catch (e) {
        const err = e as {
          status?: number;
          error?: string;
          needsSignIn?: boolean;
        };
        update(q.id, {
          status: err.status === 0 ? "offline" : "error",
          error: err.needsSignIn ? "Sign out and sign in again to let the app save photos to Drive." : (err.error ?? "Couldn't save."),
        });
        return false;
      }
    },
    [update, demo, queue],
  );

  const runQueue = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    try {
      for (const q of await queue.pending()) {
        if (deleted.current.has(q.id)) continue;
        const existing = await new Promise<Result | undefined>((res) => setResults((rs) => (res(rs.find((r) => r.id === q.id)), rs)));
        if (existing?.status === "pick" || existing?.status === "saved") continue;
        if (!existing) {
          setResults((rs) => [
            {
              id: q.id,
              thumb: URL.createObjectURL(q.front),
              backThumb: q.back ? URL.createObjectURL(q.back) : undefined,
              status: "waiting",
              label: "Waiting",
            },
            ...rs,
          ]);
        }
        const ok = await processOne(q);
        if (!ok && !navigator.onLine) break;
      }
    } finally {
      processing.current = false;
    }
  }, [processOne, queue]);

  useEffect(() => {
    void runQueue();
    const online = () => void runQueue();
    window.addEventListener("online", online);
    const t = setInterval(online, 30_000);
    return () => {
      window.removeEventListener("online", online);
      clearInterval(t);
    };
  }, [runQueue]);

  const finishItem = useCallback(async () => {
    const c = card.current;
    if (!c.front) return;
    card.current = {};
    // A card (it has a back, the front showed what card it is, or the selector says cards) keeps the area
    // inside the frame; anything else keeps the whole picture.
    const picked = c.mode && c.mode !== "auto" && c.mode !== "item" ? c.mode : null;
    const isCardScan = Boolean(c.back || c.detected || picked);
    const q: QueuedScan = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      kind: c.mode === "item" && !c.detected ? "item:Other" : "auto",
      location: locationRef.current.trim(),
      condition: "",
      front: isCardScan ? c.front : (c.frontFull ?? c.front),
      back: c.back,
      coa: c.coa,
      frontText: isCardScan ? c.frontText : undefined,
      detected: c.detected ?? picked,
      demoName: c.demoName,
    };
    await queue.put(q);
    setResults((rs) => [
      {
        id: q.id,
        thumb: URL.createObjectURL(q.front),
        backThumb: q.back ? URL.createObjectURL(q.back) : undefined,
        status: "waiting",
        label: "Waiting",
      },
      ...rs,
    ]);
    void runQueue();
  }, [runQueue, queue]);

  // Switches what's being scanned (and the frame shape to match, unless you picked one).
  const applyMode = useCallback((m: Mode, byHand: boolean) => {
    setMode(m);
    if (byHand) shapePicked.current = false;
    // Other items get a frame that fills the screen; cards get the card frame.
    if (!shapePicked.current) setShape((cur) => (m === "item" ? "full" : cur === "full" ? "card" : cur));
  }, []);

  // Reads the front while you flip the card, and updates the selector to what it is.
  // Pokémon, Magic, and Yu-Gi-Oh! don't need their back.
  const checkFront = useCallback(
    (front: Blob) => {
      void (async () => {
        const lines = await readText(await shrink(front, OCR_PX, 0.9)).catch(() => [] as OcrLine[]);
        if (card.current.front !== front) return; // already moved on
        card.current.frontText = lines;
        const kind = detectKind(lines);
        card.current.detected = kind;
        if (!kind) return;
        applyMode(kind, false);
        setHint(stepRef.current === "back" ? `${LABEL[kind]}. Now the back.` : `${LABEL[kind]}. Next one.`);
      })();
    },
    [applyMode],
  );

  // ---------- camera ----------

  const offerRetake = useCallback((side: "front" | "back") => {
    setRetake(side);
    if (retakeTimer.current) clearTimeout(retakeTimer.current);
    retakeTimer.current = setTimeout(() => setRetake(null), 3500);
  }, []);

  // Throws away the last photo and takes it again.
  function doRetake() {
    if (retakeTimer.current) clearTimeout(retakeTimer.current);
    const side = retake;
    setRetake(null);
    lastSnap.current = null;
    if (side === "back") {
      card.current.back = undefined;
      setStep("back");
      setHint("Retake the back");
    } else if (side === "front") {
      card.current = {};
      setStep("front");
      setHint("Retake the front");
    }
  }

  const capture = useCallback(async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const vw = viewRef.current;
    if (!vw) return;
    // Hardware zoom already narrows the picture; on-screen zoom is applied here.
    const dz = zoomCaps.current ? 1 : zoomRef.current;
    const area = outlineRef.current && itemBoxRef.current ? padBox(itemBoxRef.current, vw) : guideRect(vw, shapeRef.current);
    const blob = await frameToBlob(v, toVideo(area, v, vw, dz), SAVE_PX);
    captures.current++;
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    navigator.vibrate?.(30);
    if (stepRef.current === "front") {
      // A new front means the last item is done.
      if (card.current.front) await finishItem();
      card.current = {
        front: blob,
        frontFull: await frameToBlob(v, toVideo({ x: 0, y: 0, w: vw.sw, h: vw.sh }, v, vw, dz), SAVE_PX),
        mode: modeRef.current,
        demoName: sample.current?.showing() ?? undefined,
      };
      if (sidesRef.current === "both") {
        setStep("back");
        setHint("Now the back");
      } else {
        setHint("Next one");
      }
      offerRetake("front");
      checkFront(blob);
      return;
    }
    card.current.back = blob;
    setStep("front");
    setHint("Next one");
    offerRetake("back");
  }, [finishItem, checkFront, offerRetake]);

  // Every 150 ms: auto snap outlines the item, and auto capture takes the photo when the picture holds
  // still and in focus for half a second and differs from the last photo.
  useEffect(() => {
    if (phase !== "camera" || (!auto && !outline) || settingsOpen || tips !== null) {
      setSteady(0);
      setBlurry(false);
      setItemBox(null);
      return;
    }
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    // Auto snap looks at the whole picture between the controls, small.
    const oc = document.createElement("canvas");
    const octx = oc.getContext("2d", { willReadFrequently: true })!;
    let smooth: Rect | null = null;
    let missing = 0;
    const findItem = () => {
      const v = video.current;
      const vw = viewRef.current;
      if (!v || !v.videoWidth || !vw) return;
      const band = { x: 0, y: vw.top, w: vw.sw, h: Math.max(1, vw.sh - vw.top - vw.bottom) };
      const r = toVideo(band, v, vw, zoomCaps.current ? 1 : zoomRef.current);
      const OW = 120;
      oc.width = OW;
      oc.height = Math.max(16, Math.round((OW * r.h) / r.w));
      octx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, oc.width, oc.height);
      const d = octx.getImageData(0, 0, oc.width, oc.height).data;
      const g = new Uint8ClampedArray(d.length / 4);
      for (let i = 0; i < g.length; i++) g[i] = (d[i * 4]! * 3 + d[i * 4 + 1]! * 6 + d[i * 4 + 2]!) / 10;
      const box = detectItem(g, oc.width, oc.height);
      if (!box) {
        // Keep the last outline briefly, so it doesn't flicker.
        if (++missing >= 4 && smooth) {
          smooth = null;
          setItemBox(null);
        }
        return;
      }
      missing = 0;
      const k = band.w / oc.width;
      const found = { x: box.x * k, y: band.y + box.y * k, w: box.w * k, h: box.h * k };
      const a = 0.5;
      smooth = smooth
        ? {
            x: smooth.x + (found.x - smooth.x) * a,
            y: smooth.y + (found.y - smooth.y) * a,
            w: smooth.w + (found.w - smooth.w) * a,
            h: smooth.h + (found.h - smooth.h) * a,
          }
        : found;
      const cur = itemBoxRef.current;
      if (!cur || Math.abs(cur.x - smooth.x) + Math.abs(cur.y - smooth.y) + Math.abs(cur.w - smooth.w) + Math.abs(cur.h - smooth.h) > 3)
        setItemBox({ ...smooth });
    };
    let prev: Uint8ClampedArray | null = null;
    let stillFor = 0;
    let blurFor = 0;
    let armed = true;
    let busy = false;
    let shown = 0;
    const recent: number[] = [];
    const W = 96;
    const sample = () => {
      const v = video.current;
      if (!v || !v.videoWidth) return null;
      const vw = viewRef.current;
      if (!vw) return null;
      const r = toVideo(guideRect(vw, shapeRef.current), v, vw, zoomCaps.current ? 1 : zoomRef.current);
      c.width = W;
      c.height = Math.max(8, Math.round((W * r.h) / r.w));
      ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const g = new Uint8ClampedArray(d.length / 4);
      for (let i = 0; i < g.length; i++) g[i] = (d[i * 4]! * 3 + d[i * 4 + 1]! * 6 + d[i * 4 + 2]!) / 10;
      return { g, w: c.width, h: c.height };
    };
    // Movement and detail are compared at half size, so camera noise doesn't count as movement.
    const half = (g: Uint8ClampedArray, w: number, h: number) => {
      const hw = Math.floor(w / 2);
      const hh = Math.floor(h / 2);
      const out = new Uint8ClampedArray(hw * hh);
      for (let y = 0; y < hh; y++)
        for (let x = 0; x < hw; x++) {
          const i = 2 * y * w + 2 * x;
          out[y * hw + x] = (g[i]! + g[i + 1]! + g[i + w]! + g[i + w + 1]!) / 4;
        }
      return out;
    };
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
      if (a.length !== b.length) return 99;
      let s = 0;
      for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
      return s / a.length;
    };
    const spread = (a: Uint8ClampedArray) => {
      let m = 0;
      for (const x of a) m += x;
      m /= a.length;
      let v = 0;
      for (const x of a) v += (x - m) ** 2;
      return Math.sqrt(v / a.length);
    };
    const show = (p: number) => {
      const q = Math.round(p * 4) / 4;
      if (q !== shown) {
        shown = q;
        setSteady(q);
      }
    };
    const t = setInterval(async () => {
      if (busy) return;
      if (outline) findItem();
      if (!auto) return;
      const s = sample();
      if (!s) return;
      const g = half(s.g, s.w, s.h);
      const motion = prev ? diff(g, prev) : 99;
      prev = g;
      if (motion > 10) armed = true;
      stillFor = motion < 3.5 ? stillFor + 150 : 0;
      const changed = !lastSnap.current || diff(g, lastSnap.current) > 12;
      // spread: something with detail is in the frame, not a blank surface.
      const ready = armed && changed && spread(g) > 9;
      // In focus: sharp enough, and not still sharpening (the camera settles its focus at the sharpest point).
      const sharp = sharpness(s.g, s.w, s.h);
      if (stillFor === 0) recent.length = 0;
      recent.push(sharp);
      if (recent.length > 4) recent.shift();
      const focused = sharp >= 8 && sharp >= 0.85 * Math.max(...recent);
      blurFor = ready && stillFor >= 500 && !focused ? blurFor + 150 : 0;
      setBlurry(blurFor >= 1500);
      show(ready ? Math.min(1, stillFor / 500) * (focused ? 1 : 0.75) : 0);
      if (ready && stillFor >= 500 && focused) {
        busy = true;
        armed = false;
        stillFor = 0;
        lastSnap.current = g;
        show(0);
        await capture();
        busy = false;
      }
    }, 150);
    return () => {
      clearInterval(t);
      setSteady(0);
    };
  }, [phase, auto, outline, settingsOpen, tips, capture]);

  const opening = useRef(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const start = useCallback(async () => {
    // Opening twice at once (React runs effects twice in development) would leave a dead stream.
    if (opening.current || stream.current) return;
    opening.current = true;
    setCamError("");
    try {
      let s: MediaStream;
      if (sourceRef.current === "sample") {
        // Demo: sample cards set down on a desk, turned over when the scanner wants the back.
        sample.current = sampleCamera({ wantBack: () => stepRef.current === "back", captures: () => captures.current });
        s = sample.current.stream;
      } else {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
      }
      stream.current = s;
      setPhase("camera");
      setStep("front");
      setHint("Hold an item in the frame");
      const track = s.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean; zoom?: { min: number; max: number } };
      setTorch(caps.torch ? "off" : "unsupported");
      zoomCaps.current = caps.zoom && caps.zoom.max > 1 ? { min: Math.max(1, caps.zoom.min), max: Math.min(caps.zoom.max, 5) } : null;
      setZoom(1);
      // First time on this phone: a few quick tips.
      try {
        if (!localStorage.getItem("scan-tips-v1")) setTips(0);
      } catch {}
      wake.current =
        (await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
          ?.request("screen")
          .catch(() => null)) ?? null;
    } catch {
      setCamError("The camera isn't available. Allow camera access for this site in your browser settings, then try again.");
      setPhase("error");
    } finally {
      opening.current = false;
    }
  }, []);

  // Show the camera once the camera screen is on the page.
  useEffect(() => {
    const v = video.current;
    if (phase !== "camera" || !v || !stream.current) return;
    if (v.srcObject !== stream.current) v.srcObject = stream.current;
    void v.play().catch(() => {});
  }, [phase]);

  // Open the camera as soon as the page opens.
  useEffect(() => {
    void start();
  }, [start]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const on = torch !== "on";
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch(on ? "on" : "off");
    } catch {
      setTorch("unsupported");
    }
  }

  // Pinch to zoom: the camera's zoom when the phone allows it, otherwise the picture is enlarged on screen.
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const zoomFrame = useRef<number | null>(null);
  function setZoomLevel(z: number) {
    const max = zoomCaps.current?.max ?? 3;
    const next = Math.round(Math.min(max, Math.max(1, z)) * 10) / 10;
    setZoom(next);
    const track = stream.current?.getVideoTracks()[0];
    if (!zoomCaps.current || !track) return;
    if (zoomFrame.current) cancelAnimationFrame(zoomFrame.current);
    zoomFrame.current = requestAnimationFrame(() => {
      void track.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] }).catch(() => {});
    });
  }
  const touchDist = (t: React.TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) pinch.current = { d: touchDist(e.touches), z: zoomRef.current };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length !== 2 || !pinch.current) return;
    setZoomLevel(pinch.current.z * (touchDist(e.touches) / pinch.current.d));
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
  }

  // Frame shape: card, sideways card, graded slab, or whole item. Tapping cycles through them.
  function nextShape() {
    const next = SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length]!;
    shapePicked.current = true;
    setShape(next);
    lastSnap.current = null;
    setHint(`Frame: ${SHAPE_LABEL[next].toLowerCase()}`);
  }

  // Demo: switch between the sample cards and your own camera.
  function switchSource(next: "sample" | "camera") {
    if (next === source) return;
    if (card.current.front) void finishItem();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    sample.current?.stop();
    sample.current = null;
    sourceRef.current = next;
    setSource(next);
    setPanel(null);
    setPhase("starting");
    void start();
  }

  function closeTips() {
    setTips(null);
    try {
      localStorage.setItem("scan-tips-v1", "1");
    } catch {}
  }

  // Front only / Front & back. Choosing Front only while it waits for a back finishes that item without one.
  function chooseSides(next: Sides) {
    setSides(next);
    if (next === "front" && stepRef.current === "back") {
      setStep("front");
      setHint("Next one");
    }
  }

  // Leaving the page (say, for another tab in the menu): keep the item in progress and turn the camera off.
  const finishRef = useRef(finishItem);
  finishRef.current = finishItem;
  useEffect(
    () => () => {
      if (card.current.front) void finishRef.current();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      sample.current?.stop();
      sample.current = null;
    },
    [],
  );

  // Measure the camera screen and its controls, so the frame on screen matches what's saved.
  useEffect(() => {
    const place = () => {
      // Height of an element that's showing (0 when hidden with display: none, as the menu is on large screens).
      const height = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height ?? 0;
      const wide = window.matchMedia("(min-width: 768px)").matches;
      // The demo keeps its header (its menu is there) on phones too.
      setFrame({ top: wide || demo ? height("[data-app-header]") : 0, bottom: height("[data-bottom-nav]") });
      const el = stage.current;
      if (!el) return;
      // The frame is centered on the screen, clear of the top buttons and the shutter row. The prompt, Retake,
      // and the result card float over the picture.
      setView({
        sw: el.clientWidth,
        sh: el.clientHeight,
        top: (topBar.current?.offsetHeight ?? 0) + (promptRef.current?.offsetHeight ?? 28) + 10,
        bottom: (bottomBar.current?.offsetHeight ?? 0) + 6,
      });
    };
    place();
    const ro = new ResizeObserver(place);
    [stage.current, topBar.current, bottomBar.current, shutterRow.current, promptRef.current].forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [phase, demo]);

  async function pick(r: Result, c: Candidate | null) {
    const q = (await queue.pending()).find((x) => x.id === r.id);
    if (!q) return;
    const chosen: Candidate = c ?? {
      ...r.candidates![0]!,
      name: "Unidentified card",
      catalogId: "",
      price: null,
      confidence: "low",
      problem: "none of the suggested printings matched",
    };
    await processOne(q, chosen);
  }

  // Deletes a scan you don't want. Not saved yet: dropped from this phone. Saved: removed from the sheet,
  // or, when it was added to an item you already had, the quantity goes back down by one.
  async function removeResult(r: Result) {
    if (demo || r.status !== "saved") {
      deleted.current.add(r.id);
      await queue.remove(r.id);
      setResults((rs) => rs.filter((x) => x.id !== r.id));
      return;
    }
    if (!r.itemId) return;
    const res =
      r.merged && (r.quantity ?? 1) > 1
        ? await api(`/api/items/${r.itemId}`, { method: "PATCH", json: { quantity: (r.quantity ?? 2) - 1 } })
        : await api(`/api/items/${r.itemId}`, { method: "DELETE" });
    if (res.ok) setResults((rs) => rs.filter((x) => x.id !== r.id));
    else update(r.id, { detail: `Couldn't delete: ${res.error}` });
  }

  async function changeCondition(r: Result, value: string) {
    if (!r.itemId) return;
    if (demo) return update(r.id, { detail: `Condition set to ${value} (demo, not saved).` });
    const res = await api(`/api/items/${r.itemId}`, {
      method: "PATCH",
      json: { condition: value },
    });
    update(r.id, res.ok ? { detail: `Condition set to ${value}.` } : { error: res.error });
  }

  const total = results.reduce((sum, r) => sum + (r.status === "saved" && r.price ? r.price : 0), 0);
  const counts = {
    saved: results.filter((r) => r.status === "saved").length,
    working: results.filter((r) => ["waiting", "reading", "saving"].includes(r.status)).length,
    attention: results.filter((r) => ["pick", "error", "offline"].includes(r.status)).length,
  };

  // ---------- camera ----------

  const prompt =
    phase === "starting"
      ? "Opening the camera…"
      : phase === "error"
        ? ""
        : blurry
          ? "Hold steady. It's blurry."
          : step === "back"
            ? hint || "Now the back"
            : hint || "Hold an item in the frame";
  const latest = results[0];
  const digital = !zoomCaps.current && zoom !== 1;
  const round = "flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur";
  const toggleAuto = () => {
    setAuto(!auto);
    setHint(auto ? "Auto capture off. Tap to shoot." : "Auto capture on");
  };
  const toggleOutline = () => {
    setOutline(!outline);
    setHint(outline ? "Auto snap off" : "Auto snap on");
  };
  return (
    <div ref={stage} className="fixed inset-x-0 z-30 overflow-hidden bg-black text-white" style={{ top: frame.top, bottom: frame.bottom }}>
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="absolute inset-0 h-full w-full touch-none object-cover"
        style={digital ? { transform: `scale(${zoom})` } : undefined}
      />
      {view && <Guide rect={outline && itemBox ? padBox(itemBox, view) : guideRect(view, shape)} steady={steady} found={Boolean(outline && itemBox)} />}
      {flash && <div className="absolute inset-0 bg-white/70" />}
      <div ref={topBar} className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <div className="flex flex-1 basis-0 gap-2">
          <button
            type="button"
            onClick={toggleOutline}
            aria-pressed={outline}
            aria-label={outline ? "Auto snap is on: the frame follows the item" : "Auto snap is off"}
            className={`${round} ${outline ? "!bg-white text-black" : ""}`}
          >
            <OutlineIcon off={!outline} />
          </button>
          <button
            type="button"
            onClick={toggleAuto}
            aria-pressed={auto}
            aria-label={auto ? "Auto capture is on: photos are taken on their own" : "Auto capture is off"}
            className={`${round} ${auto ? "!bg-white text-black" : ""}`}
          >
            <AutoCaptureIcon off={!auto} />
          </button>
        </div>
        <label className="relative shrink-0">
          <span className="sr-only">What you&apos;re scanning</span>
          <select
            value={mode}
            onChange={(e) => applyMode(e.target.value as Mode, true)}
            className="min-h-11 appearance-none rounded-full bg-black/60 pl-4 pr-9 text-base font-bold text-white backdrop-blur"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs">
            ▼
          </span>
        </label>
        <div className="flex flex-1 basis-0 justify-end gap-2">
          <button type="button" onClick={nextShape} aria-label={`Frame: ${SHAPE_LABEL[shape]}. Tap to change.`} className={round}>
            <ShapeIcon shape={shape} />
          </button>
          {torch !== "unsupported" && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torch === "on"}
              aria-label={torch === "on" ? "Flash is on" : "Flash is off"}
              className={`${round} ${torch === "on" ? "!bg-white text-black" : ""}`}
            >
              <FlashIcon off={torch !== "on"} />
            </button>
          )}
        </div>
      </div>
      <p
        ref={promptRef}
        className="absolute inset-x-0 truncate px-4 text-center text-base font-medium leading-7 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]"
        style={{ top: (topBar.current?.offsetHeight ?? 60) + 2 }}
        aria-live="polite"
      >
        {prompt || "\u00a0"}
      </p>
      <div
        ref={bottomBar}
        className="absolute inset-x-0 bottom-0 px-4 pt-6 pb-3 flex flex-col gap-3 bg-gradient-to-t from-black/75 via-black/45 to-transparent"
      >
        {/* One row: Retake, Skip the back, and zoom when they apply; otherwise the latest scan (tap for the full list). */}
        <div className="h-14">
          {retake || step === "back" || zoom !== 1 ? (
            <div className="flex h-full items-center justify-center gap-2">
              {zoom !== 1 && (
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  aria-label="Zoom back out"
                  className="min-h-9 rounded-full bg-black/50 px-3 text-sm font-medium tabular-nums backdrop-blur"
                >
                  {zoom.toFixed(1)}×
                </button>
              )}
              {retake && (
                <button type="button" onClick={doRetake} className="min-h-9 rounded-full bg-white px-4 text-sm font-medium text-black">
                  Retake
                </button>
              )}
              {step === "back" && (
                <button
                  type="button"
                  onClick={() => {
                    setStep("front");
                    setHint("No back. Next one.");
                  }}
                  className="min-h-9 rounded-full bg-black/50 px-4 text-sm font-medium backdrop-blur"
                >
                  Skip the back
                </button>
              )}
            </div>
          ) : (
            latest && (
              <button
                type="button"
                onClick={() => setPanel("review")}
                className="flex w-full items-center gap-3 rounded-2xl bg-black/60 p-2 pr-3 text-left backdrop-blur"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={latest.thumb} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{latest.status === "waiting" || latest.status === "reading" ? "Reading…" : latest.label}</span>
                  <span className={`truncate text-xs ${["pick", "error", "offline"].includes(latest.status) ? "text-warn" : "text-white/70"}`}>
                    {latest.status === "saved"
                      ? latest.merged
                        ? "Added to one you had"
                        : latest.problem
                          ? "Saved · check this"
                          : "Saved"
                      : latest.status === "pick"
                        ? "Tap to pick the right one"
                        : latest.status === "offline"
                          ? "Saves when you're back online"
                          : latest.status === "error"
                            ? "Couldn't save. Tap for details."
                            : latest.status === "saving"
                              ? "Saving…"
                              : `${counts.saved} saved`}
                  </span>
                </span>
                {latest.status === "saved" && (
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-base font-medium tabular-nums">{latest.price ? money(latest.price) : "No price yet"}</span>
                  </span>
                )}
              </button>
            )
          )}
        </div>
        <div ref={shutterRow} className="grid grid-cols-3 items-center">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={counts.attention ? `Settings, ${counts.attention} to check` : "Settings"}
            className={`${round} relative justify-self-start`}
          >
            <GearIcon />
            {counts.attention > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-warn px-1 text-[11px] font-bold text-black">
                {counts.attention}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={capture}
            aria-label="Take photo"
            className="h-16 w-16 justify-self-center rounded-full border-4 border-white bg-white/25 active:bg-white/60"
          />
          <button
            type="button"
            onClick={() => {
              const next = sides === "both" ? "front" : "both";
              chooseSides(next);
              if (stepRef.current !== "back") setHint(next === "both" ? "2 photos: front and back" : "1 photo: front only");
            }}
            aria-label={sides === "both" ? "2 photos: front and back. Tap for 1 photo." : "1 photo: front only. Tap for 2 photos."}
            className={`${round} justify-self-end`}
          >
            <SidesIcon both={sides === "both"} />
          </button>
        </div>
      </div>

      {tips !== null && phase === "camera" && (
        <Tips step={tips} onNext={() => (tips >= TIPS.length - 1 ? closeTips() : setTips(tips + 1))} onClose={closeTips} />
      )}

      {phase === "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="flex max-w-sm flex-col gap-4 rounded-2xl bg-surface p-5 text-ink">
            <p className="text-sm">{camError}</p>
            <button type="button" onClick={start} className="min-h-12 rounded-xl bg-navy px-5 font-medium text-navy-ink">
              Try again
            </button>
            <p className="text-sm text-muted">
              <Link href="/add">Add without a photo</Link>
              {intakeUrl && (
                <>
                  {" · "}
                  <a href={intakeUrl} target="_blank" rel="noopener">
                    Send photos to Claude instead
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {panel && (
        <div role="dialog" aria-label="Scanning settings and this session" className="absolute inset-0 z-10 flex flex-col bg-bg text-ink">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
            <div className="flex flex-col">
              <h2 className="text-lg font-bold">Scanning</h2>
              {counts.saved > 0 && (
                <p className="text-sm text-muted tabular-nums">
                  {counts.saved} saved{total ? ` · ${money(total)} total` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
            <label className="flex flex-col gap-1.5 text-base font-medium">
              Where these are kept
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder="Box 12, Binder 3…"
                className="min-h-12 rounded-xl border border-line bg-surface px-3 text-base"
              />
              <span className="text-sm font-normal text-muted">Saved with every item you scan, so you can find it later.</span>
            </label>

            <section className="flex flex-col gap-2" aria-label="This session">
              <h3 className="text-sm font-medium text-muted">
                This session
                {results.length ? ` · ${results.length}` : ""}
                {counts.attention ? <span className="text-warn"> · {counts.attention} to check</span> : null}
              </h3>
              {results.length ? (
                <ResultList
                  results={results}
                  onPick={pick}
                  onCondition={changeCondition}
                  onDelete={removeResult}
                  onView={setViewing}
                  itemBase={demo ? "/demo/items" : "/items"}
                />
              ) : (
                <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-muted">Nothing scanned yet.</p>
              )}
              {!ebayOn && !demo && (
                <p className="text-sm text-muted">
                  Sports cards are saved without a price until eBay is connected. Claude&apos;s nightly run prices the ones it needs to.
                </p>
              )}
            </section>

            {demo ? (
              <section className="flex flex-col gap-2" aria-label="Camera">
                <h3 className="text-sm font-medium text-muted">Camera</h3>
                <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                  {(["sample", "camera"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => switchSource(v)}
                      aria-pressed={source === v}
                      className="flex min-h-14 items-center justify-between gap-3 px-4 text-left text-base font-medium"
                    >
                      {v === "sample" ? "Sample cards" : "My camera"}
                      {source === v && <span className="text-sm text-ok">In use</span>}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted">
                  This is the demo: nothing is saved or sent anywhere. Sample cards show how scanning works; with your camera, it reads what you hold up and
                  matches it to the demo&apos;s sample items when it can.
                </p>
              </section>
            ) : (
              <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                <Link href="/add" className="flex min-h-14 items-center px-4 text-base font-medium text-ink no-underline">
                  Add without a photo
                </Link>
                {intakeUrl && (
                  <a href={intakeUrl} target="_blank" rel="noopener" className="flex min-h-14 items-center px-4 text-base font-medium text-ink no-underline">
                    Send photos to Claude instead
                  </a>
                )}
              </div>
            )}
          </div>
          {/* Where your thumb is after tapping the gear. */}
          <div className="border-t border-line bg-surface px-4 py-3">
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-navy text-base font-bold text-navy-ink"
            >
              <CameraIcon />
              Back to camera
            </button>
          </div>
        </div>
      )}

      {viewing && (
        <button
          type="button"
          aria-label="Close photo"
          onClick={() => setViewing(null)}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}

// ---------- icons ----------

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A lightning bolt; crossed out when off. */
function FlashIcon({ off }: { off: boolean }) {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill={off ? "none" : "currentColor"} />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

/** The frame shape: an upright card, a sideways card, a tall slab, or corners for the whole item. */
function ShapeIcon({ shape }: { shape: Shape }) {
  return (
    <svg {...iconProps} aria-hidden>
      {shape === "card" && <rect x="7" y="4" width="10" height="16" rx="1.5" />}
      {shape === "sideways" && <rect x="3" y="7" width="18" height="10" rx="1.5" />}
      {shape === "slab" && (
        <>
          <rect x="6.5" y="2.5" width="11" height="19" rx="1.5" />
          <path d="M6.5 7h11" />
        </>
      )}
      {shape === "full" && <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />}
    </svg>
  );
}

/** 1 photo (front only) or 2 photos (front and back): one card or two, with the number on it. */
function SidesIcon({ both }: { both: boolean }) {
  return both ? (
    <svg {...iconProps} aria-hidden>
      <rect x="2.5" y="6" width="10" height="14" rx="1.5" />
      <path d="M8 4V3.5A1.5 1.5 0 0 1 9.5 2h10A1.5 1.5 0 0 1 21 3.5v13a1.5 1.5 0 0 1-1.5 1.5H17" />
      <text x="7.5" y="16.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">
        2
      </text>
    </svg>
  ) : (
    <svg {...iconProps} aria-hidden>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">
        1
      </text>
    </svg>
  );
}

/** Auto snap: a frame whose corners hug a card (the frame follows the item). Crossed out when off. */
function OutlineIcon({ off }: { off: boolean }) {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M3 8V4a1 1 0 0 1 1-1h4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4" />
      <rect x="8" y="6.5" width="8" height="11" rx="1" strokeDasharray="2 1.6" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Auto capture: a shutter with an A (takes the photo on its own). Crossed out when off. */
function AutoCaptureIcon({ off }: { off: boolean }) {
  return (
    <svg {...iconProps} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 16l3-8 3 8M10.1 13.4h3.8" strokeWidth={1.8} />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

/** The frame on screen, the same area that's saved (see guideRect and toVideo). Turns green as auto snap gets ready. */
function Guide({ rect: r, steady, found }: { rect: Rect; steady: number; found: boolean }) {
  const on = steady > 0;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={`absolute overflow-hidden rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.25)] duration-150 ${found ? "transition-all" : "transition-[border-color,border-width]"} ${
          on ? "border-[3px] border-ok" : "border-2 border-white/90"
        }`}
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
      >
        {/* Fills up as the picture holds still; the photo is taken when it's full. */}
        <div className="absolute bottom-0 left-0 h-1.5 bg-ok transition-[width] duration-150" style={{ width: `${steady * 100}%` }} />
      </div>
    </div>
  );
}

const TIPS = [
  {
    title: "Hold it still",
    body: "Hold an item up to the camera. The frame snaps around it, turns green, and the photo is taken on its own. Tap the round button any time to take it yourself.",
  },
  {
    title: "It figures out what it is",
    body: "The menu at the top follows what you scan. Each item takes 1 photo, the front. Tap the button at the bottom right for 2, front and back. Sports cards are easiest to identify from the back.",
  },
  {
    title: "Auto, frame, and fixes",
    body: "Top left: auto snap (the frame follows the item) and auto capture (takes the photo on its own). Top right: the frame shape and the flash. Bottom right: 1 or 2 photos per item. Pinch to zoom. The gear has your location and everything you've scanned.",
  },
];

function Tips({ step, onNext, onClose }: { step: number; onNext: () => void; onClose: () => void }) {
  const tip = TIPS[step]!;
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/60 p-4 pb-8" role="dialog" aria-label="Scanning tips">
      <div className="flex w-full flex-col gap-3 rounded-2xl bg-surface p-5 text-ink">
        <p className="text-xs font-medium text-muted tabular-nums">
          {step + 1} of {TIPS.length}
        </p>
        <h2 className="text-lg font-bold">{tip.title}</h2>
        <p className="text-base">{tip.body}</p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <button type="button" onClick={onClose} className="min-h-12 px-2 text-base font-medium text-muted">
            Skip
          </button>
          <button type="button" onClick={onNext} className="min-h-12 rounded-xl bg-navy px-6 text-base font-medium text-navy-ink">
            {step === TIPS.length - 1 ? "Start scanning" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultList({
  results,
  onPick,
  onCondition,
  onDelete,
  onView,
  itemBase,
}: {
  results: Result[];
  onPick: (r: Result, c: Candidate | null) => void;
  onCondition: (r: Result, value: string) => void;
  onDelete: (r: Result) => Promise<void>;
  onView: (url: string) => void;
  itemBase: string;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {results.map((r) => (
        <ResultRow key={r.id} r={r} onPick={onPick} onCondition={onCondition} onDelete={onDelete} onView={onView} itemBase={itemBase} />
      ))}
    </ul>
  );
}

function ResultRow({
  r,
  onPick,
  onCondition,
  onDelete,
  onView,
  itemBase,
}: {
  r: Result;
  onPick: (r: Result, c: Candidate | null) => void;
  onCondition: (r: Result, value: string) => void;
  onDelete: (r: Result) => Promise<void>;
  onView: (url: string) => void;
  itemBase: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const conditions = (r.category && categoryByName(r.category)?.conditions) || [];
  const working = r.status === "reading" || r.status === "saving";
  const photo = "h-36 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-bg";
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onView(r.thumb)} aria-label="View the front" className={photo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.thumb} alt="" className="h-full w-full object-cover" />
          </button>
          {r.backThumb && (
            <button type="button" onClick={() => onView(r.backThumb!)} aria-label="View the back" className={photo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.backThumb} alt="" className="h-full w-full object-cover" />
            </button>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium break-words">{r.label}</span>
          <span className="text-sm text-muted">
            {r.status === "saved"
              ? `${r.merged ? "Added to an existing item" : "Saved"}${r.price ? `, ${money(r.price)}` : ""}`
              : r.status === "pick"
                ? "Which one is it?"
                : r.status === "offline"
                  ? "Waiting for a connection. It'll save on its own."
                  : r.status === "error"
                    ? r.error
                    : r.status === "reading"
                      ? "Reading it…"
                      : r.status === "saving"
                        ? "Saving…"
                        : "Waiting…"}
          </span>
          {r.detail && <span className="text-sm text-warn">{r.detail}</span>}
        </div>
      </div>
      {r.status === "pick" && (
        <div className="flex flex-col gap-2">
          {r.candidates!.map((c) => (
            <button
              key={c.catalogId || c.label}
              type="button"
              onClick={() => onPick(r, c)}
              className="min-h-12 rounded-xl border border-line px-4 text-left text-sm font-medium"
            >
              {c.label}
              {c.price ? ` · ${money(c.price.value)}` : ""}
            </button>
          ))}
          <button type="button" onClick={() => onPick(r, null)} className="min-h-12 rounded-xl px-4 text-left text-sm text-muted underline">
            None of these
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {r.status === "saved" && r.itemId && (
          <>
            <Link
              href={`${itemBase}/${r.itemId}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium text-ink no-underline"
            >
              Open
            </Link>
            {!r.merged && conditions.length > 0 && (
              <select
                aria-label="Condition"
                defaultValue=""
                onChange={(e) => e.target.value && onCondition(r, e.target.value)}
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm"
              >
                <option value="">Change condition</option>
                {conditions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </>
        )}
        {!working && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!confirm) {
                setConfirm(true);
                setTimeout(() => setConfirm(false), 4000);
                return;
              }
              setBusy(true);
              await onDelete(r);
              setBusy(false);
              setConfirm(false);
            }}
            className={`ml-auto min-h-11 rounded-xl px-4 text-sm font-medium disabled:opacity-50 ${confirm ? "bg-bad text-white" : "border border-line text-bad"}`}
          >
            {busy ? "Deleting…" : confirm ? (r.status === "saved" ? (r.merged ? "Tap to take 1 off" : "Tap to delete from sheet") : "Tap to delete") : "Delete"}
          </button>
        )}
      </div>
    </li>
  );
}
