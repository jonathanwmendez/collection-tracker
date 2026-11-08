"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { categoryByName } from "@/lib/categories";
import type { Candidate } from "@/lib/identify";
import { pendingScans, putScan, removeScan, type QueuedScan } from "@/lib/scan-queue";
import { detectKind, type CardKind, type OcrLine } from "@/lib/card-text";

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
// Trading cards all have the same back, so they don't need one. Sports cards are read from the back.
const NO_BACK_NEEDED: CardKind[] = ["magic", "pokemon", "yugioh"];
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

/** The card frame on screen (2:3, like a card; a little taller for slabs), centered between the controls. */
function guideRect(v: View): Rect {
  const bh = Math.max(1, v.sh - v.top - v.bottom);
  let gw = v.sw * 0.86;
  let gh = gw * 1.5;
  if (gh > bh * 0.94) {
    gh = bh * 0.94;
    gw = gh / 1.5;
  }
  return { x: (v.sw - gw) / 2, y: v.top + (bh - gh) / 2, w: gw, h: gh };
}

/** The video fills the screen and its edges are cut off (object-cover). This maps a rectangle on screen to the video. */
function toVideo(r: Rect, video: HTMLVideoElement, v: View): Rect {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const k = Math.max(v.sw / vw, v.sh / vh);
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
};

const money = (v: number) => `$${v.toFixed(2)}`;

type Capture = {
  front?: Blob;
  frontFull?: Blob;
  back?: Blob;
  coa?: Blob;
  frontText?: OcrLine[];
  detected?: CardKind | null;
};

export function Scanner({ ebayOn, intakeUrl }: { ebayOn: boolean; intakeUrl?: string | null }) {
  const [phase, setPhase] = useState<"starting" | "camera" | "review">("starting");
  const [location, setLocation] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [auto, setAuto] = useState(true);
  const [step, setStep] = useState<"front" | "back" | "coa">("front");
  const [ready, setReady] = useState<Capture | null>(null);
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
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("scan-session", JSON.stringify({ location, auto }));
    } catch {}
  }, [location, auto]);

  const update = useCallback((id: string, patch: Partial<Result>) => setResults((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  // ---------- processing queue: read, identify, upload, save (one at a time, survives reloads) ----------

  const processOne = useCallback(
    async (q: QueuedScan, chosen?: Candidate): Promise<boolean> => {
      update(q.id, { status: "reading" });
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
                json: { kind: "auto", front, back, hasBack: Boolean(q.back) },
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
          detail: r.data.merged ? `Already had it. Quantity is now ${r.data.quantity}.` : candidate.problem ? `Check this: ${candidate.problem}.` : "",
        });
        await removeScan(q.id);
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
    [update],
  );

  const runQueue = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    try {
      for (const q of await pendingScans()) {
        const existing = await new Promise<Result | undefined>((res) => setResults((rs) => (res(rs.find((r) => r.id === q.id)), rs)));
        if (existing?.status === "pick" || existing?.status === "saved") continue;
        if (!existing) {
          setResults((rs) => [
            {
              id: q.id,
              thumb: URL.createObjectURL(q.front),
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
  }, [processOne]);

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
    setReady(null);
    // A card (it has a back, or the front showed what card it is) keeps the area inside the frame;
    // anything else keeps the whole picture.
    const isCardScan = Boolean(c.back || c.detected);
    const q: QueuedScan = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      kind: "auto",
      location: locationRef.current.trim(),
      condition: "",
      front: isCardScan ? c.front : (c.frontFull ?? c.front),
      back: c.back,
      coa: c.coa,
      frontText: isCardScan ? c.frontText : undefined,
      detected: c.detected ?? null,
    };
    await putScan(q);
    setResults((rs) => [
      {
        id: q.id,
        thumb: URL.createObjectURL(q.front),
        status: "waiting",
        label: "Waiting",
      },
      ...rs,
    ]);
    void runQueue();
  }, [runQueue]);

  // Reads the front while you flip the card. A Pokémon, Magic, or Yu-Gi-Oh! card doesn't need its back.
  const checkFront = useCallback((front: Blob) => {
    void (async () => {
      const lines = await readText(await shrink(front, OCR_PX, 0.9)).catch(() => [] as OcrLine[]);
      if (card.current.front !== front) return; // already moved on
      card.current.frontText = lines;
      const kind = detectKind(lines);
      card.current.detected = kind;
      if (kind && NO_BACK_NEEDED.includes(kind) && stepRef.current === "back") {
        setStep("front");
        setReady({ ...card.current });
        setHint(`${LABEL[kind]}. Next one.`);
      } else if (kind && stepRef.current === "back") {
        setHint(`${LABEL[kind]}. Now the back.`);
      }
    })();
  }, []);

  // ---------- camera ----------

  const capture = useCallback(async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const vw = viewRef.current;
    if (!vw) return;
    const blob = await frameToBlob(v, toVideo(guideRect(vw), v, vw), SAVE_PX);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    navigator.vibrate?.(30);
    const current = stepRef.current;
    if (current === "coa") {
      card.current.coa = blob;
      setReady({ ...card.current });
      setStep("front");
      setHint("Certificate added. Next item.");
      return;
    }
    if (current === "front") {
      // A new front means the last item is done.
      if (card.current.front) await finishItem();
      card.current = {
        front: blob,
        frontFull: await frameToBlob(v, toVideo({ x: 0, y: 0, w: vw.sw, h: vw.sh }, v, vw), SAVE_PX),
      };
      setStep("back");
      setHint("Flip it over");
      checkFront(blob);
      return;
    }
    card.current.back = blob;
    setReady({ ...card.current });
    setStep("front");
    setHint("Next item, or add a certificate");
  }, [finishItem, checkFront]);

  // Auto-snap: when the picture holds still for half a second and differs from the last photo.
  useEffect(() => {
    if (phase !== "camera" || !auto || editingLocation) return;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    let prev: Uint8ClampedArray | null = null;
    let last: Uint8ClampedArray | null = null;
    let stillFor = 0;
    let armed = true;
    let busy = false;
    const W = 48;
    const sample = () => {
      const v = video.current;
      if (!v || !v.videoWidth) return null;
      const vw = viewRef.current;
      if (!vw) return null;
      const r = toVideo(guideRect(vw), v, vw);
      c.width = W;
      c.height = Math.round((W * r.h) / r.w);
      ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const g = new Uint8ClampedArray(d.length / 4);
      for (let i = 0; i < g.length; i++) g[i] = (d[i * 4]! * 3 + d[i * 4 + 1]! * 6 + d[i * 4 + 2]!) / 10;
      return g;
    };
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
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
    const t = setInterval(async () => {
      if (busy) return;
      const g = sample();
      if (!g) return;
      const motion = prev ? diff(g, prev) : 99;
      prev = g;
      if (motion > 10) armed = true;
      stillFor = motion < 3.5 ? stillFor + 150 : 0;
      const changed = !last || diff(g, last) > 12;
      if (armed && stillFor >= 500 && changed && spread(g) > 14) {
        busy = true;
        armed = false;
        stillFor = 0;
        last = g;
        await capture();
        busy = false;
      }
    }, 150);
    return () => clearInterval(t);
  }, [phase, auto, editingLocation, capture]);

  const opening = useRef(false);
  const start = useCallback(async () => {
    // Opening twice at once (React runs effects twice in development) would leave a dead stream.
    if (opening.current || stream.current) return;
    opening.current = true;
    setCamError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      stream.current = s;
      setPhase("camera");
      setStep("front");
      setHint("Hold an item in the frame");
      wake.current =
        (await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
          ?.request("screen")
          .catch(() => null)) ?? null;
    } catch {
      setCamError("The camera isn't available. Allow camera access for this site in your browser settings, then tap Scan.");
      setPhase("review");
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

  async function stop() {
    if (card.current.front) await finishItem();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    await wake.current?.release().catch(() => {});
    wake.current = null;
    setPhase("review");
  }

  // Leaving the page (say, for another tab in the menu): keep the item in progress and turn the camera off.
  const finishRef = useRef(finishItem);
  finishRef.current = finishItem;
  useEffect(
    () => () => {
      if (card.current.front) void finishRef.current();
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    },
    [],
  );

  // Measure the camera screen and its controls, so the frame on screen matches what's saved.
  useEffect(() => {
    if (phase !== "camera") return;
    const place = () => {
      // Height of an element that's showing (0 when hidden with display: none, as the menu is on large screens).
      const height = (sel: string) => document.querySelector(sel)?.getBoundingClientRect().height ?? 0;
      const wide = window.matchMedia("(min-width: 768px)").matches;
      setFrame({ top: wide ? height("[data-app-header]") : 0, bottom: height("[data-bottom-nav]") });
      const el = stage.current;
      if (!el) return;
      setView({ sw: el.clientWidth, sh: el.clientHeight, top: (topBar.current?.offsetHeight ?? 0) + 44, bottom: bottomBar.current?.offsetHeight ?? 0 });
    };
    place();
    const ro = new ResizeObserver(place);
    [stage.current, topBar.current, bottomBar.current].forEach((el) => el && ro.observe(el));
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [phase]);

  async function pick(r: Result, c: Candidate | null) {
    const q = (await pendingScans()).find((x) => x.id === r.id);
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

  async function changeCondition(r: Result, value: string) {
    if (!r.itemId) return;
    const res = await api(`/api/items/${r.itemId}`, {
      method: "PATCH",
      json: { condition: value },
    });
    update(r.id, res.ok ? { detail: `Condition set to ${value}.` } : { error: res.error });
  }

  const counts = {
    saved: results.filter((r) => r.status === "saved").length,
    working: results.filter((r) => ["waiting", "reading", "saving"].includes(r.status)).length,
    attention: results.filter((r) => ["pick", "error", "offline"].includes(r.status)).length,
  };

  // ---------- review (after Done, or when the camera can't open) ----------

  if (phase !== "camera") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Scan</h1>
          <p className="text-muted">
            {phase === "starting"
              ? "Opening the camera…"
              : "Hold each item up to the camera. Cards are recognized on your phone, saved to your sheet, and priced for free when they can be."}
          </p>
        </div>
        {camError && <p className="text-sm rounded-lg bg-bad-soft text-bad px-3 py-2">{camError}</p>}
        {phase === "review" && (
          <button type="button" onClick={start} className="min-h-14 rounded-xl bg-navy px-6 text-lg font-medium text-navy-ink">
            {results.length ? "Scan more" : "Scan"}
          </button>
        )}
        {results.length > 0 && <ResultList results={results} onPick={pick} onCondition={changeCondition} />}
        {!ebayOn && (
          <p className="text-sm text-muted">
            Sports cards are saved without a price until eBay is connected. Claude&apos;s nightly run prices the ones it needs to.
          </p>
        )}
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
    );
  }

  // ---------- camera ----------

  const prompt = step === "coa" ? "Hold the certificate in the frame" : step === "back" ? hint || "Flip it over" : hint || "Hold an item in the frame";
  const chip = "min-h-9 shrink-0 rounded-full bg-black/50 px-3 text-xs font-medium backdrop-blur";
  const big = "min-h-11 min-w-24 rounded-full bg-black/50 px-4 text-sm font-medium backdrop-blur";
  return (
    <div ref={stage} className="fixed inset-x-0 z-30 overflow-hidden bg-black text-white" style={{ top: frame.top, bottom: frame.bottom }}>
      <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
      {view && <Guide rect={guideRect(view)} />}
      {flash && <div className="absolute inset-0 bg-white/70" />}
      <div ref={topBar} className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 text-sm">
        {editingLocation ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setEditingLocation(false);
            }}
          >
            <input
              autoFocus
              aria-label="Where these are kept"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Box 12, Binder 3…"
              className="min-h-9 flex-1 min-w-0 rounded-full bg-black/50 px-3 text-base text-white placeholder:text-white/50 backdrop-blur"
            />
            <button type="submit" className={chip}>
              Done
            </button>
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setEditingLocation(true)} className={`${chip} truncate max-w-[55%]`}>
              {location ? `Location: ${location}` : "Set location"}
            </button>
            <button type="button" onClick={() => setAuto((a) => !a)} aria-pressed={auto} className={chip}>
              Auto snap {auto ? "on" : "off"}
            </button>
          </>
        )}
      </div>
      <p
        className="absolute inset-x-0 px-4 text-center text-lg font-medium [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]"
        style={{ top: view ? view.top - 40 : 60 }}
        aria-live="polite"
      >
        {prompt}
      </p>
      <div
        ref={bottomBar}
        className="absolute inset-x-0 bottom-0 px-4 pt-6 pb-3 flex flex-col gap-3 bg-gradient-to-t from-black/75 via-black/45 to-transparent"
      >
        <p className="text-center text-xs tabular-nums text-white/80">
          {counts.saved} saved
          {counts.working ? ` · ${counts.working} working` : ""}
          {counts.attention ? ` · ${counts.attention} to check` : ""}
        </p>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={stop} className={big}>
            Done
          </button>
          <button
            type="button"
            onClick={capture}
            aria-label="Take photo"
            className="h-16 w-16 rounded-full border-4 border-white bg-white/25 active:bg-white/60"
          />
          {step === "back" ? (
            <button
              type="button"
              onClick={() => {
                setStep("front");
                setReady({ ...card.current });
                setHint("Next item, or add a certificate");
              }}
              className={big}
            >
              No back
            </button>
          ) : (
            <button type="button" disabled={!ready?.front || !!ready?.coa} onClick={() => setStep("coa")} className={`${big} disabled:opacity-40`}>
              Certificate
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {results.slice(0, 12).map((r) => (
            <span key={r.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumb} alt="" className="h-14 w-10 rounded object-cover" />
              <i
                className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border border-black ${
                  r.status === "saved" ? "bg-ok" : ["pick", "error", "offline"].includes(r.status) ? "bg-warn" : "bg-white/70"
                }`}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The card frame on screen, the same area that's saved (see guideRect and toVideo). */
function Guide({ rect: r }: { rect: Rect }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
      />
    </div>
  );
}

function ResultList({
  results,
  onPick,
  onCondition,
}: {
  results: Result[];
  onPick: (r: Result, c: Candidate | null) => void;
  onCondition: (r: Result, value: string) => void;
}) {
  return (
    <section aria-labelledby="scanned" className="flex flex-col gap-2">
      <h2 id="scanned" className="text-xs font-medium uppercase tracking-wider text-muted">
        This session
      </h2>
      <ul className="rounded-2xl border border-line bg-surface divide-y divide-line">
        {results.map((r) => (
          <ResultRow key={r.id} r={r} onPick={onPick} onCondition={onCondition} />
        ))}
      </ul>
    </section>
  );
}

function ResultRow({
  r,
  onPick,
  onCondition,
}: {
  r: Result;
  onPick: (r: Result, c: Candidate | null) => void;
  onCondition: (r: Result, value: string) => void;
}) {
  const conditions = (r.category && categoryByName(r.category)?.conditions) || [];
  return (
    <li className="flex gap-3 px-3 py-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={r.thumb} alt="" className="h-16 w-12 shrink-0 rounded object-cover border border-line" />
      <div className="min-w-0 flex-1 flex flex-col gap-1 text-sm">
        <span className="font-medium break-words">{r.label}</span>
        <span className="text-muted">
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
        {r.detail && <span className="text-xs text-warn">{r.detail}</span>}
        {r.status === "pick" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {r.candidates!.map((c) => (
              <button
                key={c.catalogId || c.label}
                type="button"
                onClick={() => onPick(r, c)}
                className="min-h-9 rounded-lg border border-line px-3 text-left text-xs"
              >
                {c.label}
                {c.price ? ` · ${money(c.price.value)}` : ""}
              </button>
            ))}
            <button type="button" onClick={() => onPick(r, null)} className="min-h-9 rounded-lg px-3 text-xs text-muted underline">
              None of these
            </button>
          </div>
        )}
        {r.status === "saved" && r.itemId && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <Link href={`/items/${r.itemId}`}>Open</Link>
            {!r.merged && conditions.length > 0 && (
              <select
                aria-label="Condition"
                defaultValue=""
                onChange={(e) => e.target.value && onCondition(r, e.target.value)}
                className="min-h-8 rounded border border-line bg-bg px-2"
              >
                <option value="">Change condition</option>
                {conditions.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
