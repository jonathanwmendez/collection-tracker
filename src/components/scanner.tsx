"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { CATEGORIES, categoryByName } from "@/lib/categories";
import type { Candidate } from "@/lib/identify";
import { pendingScans, putScan, removeScan, type QueuedScan, type ScanKindKey } from "@/lib/scan-queue";
import type { OcrLine } from "@/lib/card-text";

// ---------- what you can scan ----------

const CARD_KINDS: Array<{ key: ScanKindKey; label: string; category: string; condition: string }> = [
  { key: "sports", label: "Sports cards", category: "Sports Cards", condition: "Raw" },
  { key: "magic", label: "Magic", category: "Magic: The Gathering", condition: "NM" },
  { key: "pokemon", label: "Pokémon", category: "Pokémon", condition: "NM" },
  { key: "yugioh", label: "Yu-Gi-Oh!", category: "Yu-Gi-Oh!", condition: "NM" },
];
const ITEM_KINDS = CATEGORIES.filter((c) => !c.backPhoto).map((c) => ({
  key: `item:${c.name}` as ScanKindKey,
  label: c.name,
  category: c.name,
  condition: c.conditions[0] ?? "",
}));
const KINDS = [...CARD_KINDS, ...ITEM_KINDS];
const kindOf = (key: ScanKindKey) => KINDS.find((k) => k.key === key) ?? KINDS[0]!;
const isCard = (key: ScanKindKey) => !key.startsWith("item:");

// ---------- photos ----------

const SAVE_PX = 1600;
const OCR_PX = 2000;

/** The card-shaped area in the middle of the frame (5:7, like a card; a little taller for slabs). */
function cropRect(w: number, h: number, card: boolean) {
  if (!card) return { x: 0, y: 0, w, h };
  let gw = w * 0.86;
  let gh = gw * 1.5;
  if (gh > h * 0.94) {
    gh = h * 0.94;
    gw = gh / 1.5;
  }
  return { x: (w - gw) / 2, y: (h - gh) / 2, w: gw, h: gh };
}

async function frameToBlob(video: HTMLVideoElement, card: boolean, maxPx: number, quality = 0.82): Promise<Blob> {
  const r = cropRect(video.videoWidth, video.videoHeight, card);
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

type Worker = { recognize: (img: Blob, o?: object, out?: object) => Promise<{ data: { blocks: Array<{ paragraphs: Array<{ lines: Array<{ text: string; bbox: { y0: number; y1: number } }> }> }> | null } }> };
let workerPromise: Promise<Worker> | null = null;
function ocrWorker(): Promise<Worker> {
  workerPromise ??= import("tesseract.js").then(
    async (t) => (await t.createWorker("eng", 1, { workerPath: "/tesseract/worker.min.js", corePath: "/tesseract/core", langPath: "/tesseract/lang" })) as unknown as Worker,
  );
  return workerPromise;
}
async function readText(blob: Blob | undefined): Promise<OcrLine[]> {
  if (!blob) return [];
  const worker = await ocrWorker();
  const { data } = await worker.recognize(blob, {}, { blocks: true, text: false });
  const out: OcrLine[] = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) out.push({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0, y: l.bbox.y0 });
  return out.filter((l) => l.text);
}

// ---------- results ----------

type Result = {
  id: string;
  kind: ScanKindKey;
  thumb: string;
  status: "waiting" | "reading" | "saving" | "saved" | "pick" | "offline" | "error";
  label: string;
  detail?: string;
  price?: number | null;
  itemId?: string;
  merged?: boolean;
  candidates?: Candidate[];
  problem?: string;
  error?: string;
};

const money = (v: number) => `$${v.toFixed(2)}`;

export function Scanner({ ebayOn }: { ebayOn: boolean }) {
  const [phase, setPhase] = useState<"setup" | "camera">("setup");
  const [kind, setKind] = useState<ScanKindKey>("sports");
  const [location, setLocation] = useState("");
  const [condition, setCondition] = useState("Raw");
  const [auto, setAuto] = useState(true);
  const [step, setStep] = useState<"front" | "back" | "coa">("front");
  const [ready, setReady] = useState<{ front?: Blob; back?: Blob; coa?: Blob } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [camError, setCamError] = useState("");
  const [flash, setFlash] = useState(false);
  const [hint, setHint] = useState("");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const card = useRef<{ front?: Blob; back?: Blob; coa?: Blob }>({});
  const stepRef = useRef(step);
  stepRef.current = step;
  const sessionRef = useRef({ kind, location, condition });
  sessionRef.current = { kind, location, condition };
  const processing = useRef(false);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  // Remember the last session's choices on this phone.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("scan-session") ?? "{}");
      if (s.kind && KINDS.some((k) => k.key === s.kind)) setKind(s.kind);
      if (typeof s.location === "string") setLocation(s.location);
      if (typeof s.condition === "string") setCondition(s.condition);
      if (typeof s.auto === "boolean") setAuto(s.auto);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("scan-session", JSON.stringify({ kind, location, condition, auto }));
    } catch {}
  }, [kind, location, condition, auto]);

  const update = useCallback((id: string, patch: Partial<Result>) => setResults((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  // ---------- processing queue: read, identify, upload, save (one at a time, survives reloads) ----------

  const processOne = useCallback(
    async (q: QueuedScan, chosen?: Candidate): Promise<boolean> => {
      const k = kindOf(q.kind);
      update(q.id, { status: "reading" });
      let candidate = chosen;
      if (!candidate) {
        let candidates: Candidate[] = [];
        if (isCard(q.kind)) {
          const front = await readText(await shrink(q.front, OCR_PX, 0.9)).catch(() => []);
          const back = q.kind === "sports" ? await readText(q.back && (await shrink(q.back, OCR_PX, 0.9))).catch(() => []) : [];
          const r = await api<{ candidates: Candidate[] }>("/api/scan/identify", { method: "POST", json: { kind: q.kind, front, back } });
          if (!r.ok) {
            update(q.id, { status: r.status === 0 ? "offline" : "error", error: r.error });
            return false;
          }
          candidates = r.data.candidates;
        }
        if (candidates.length > 1) {
          update(q.id, { status: "pick", candidates, label: candidates[0]!.label });
          return true; // waits for you; the queue moves on
        }
        candidate = candidates[0] ?? {
          category: k.category,
          name: isCard(q.kind) ? "Unidentified card" : "Unidentified item",
          details: {},
          catalogId: "",
          price: null,
          label: isCard(q.kind) ? "Couldn't read this card" : `${k.category} item`,
          confidence: "low",
          problem: isCard(q.kind) ? "the scanner couldn't read this card" : "",
        };
      }

      update(q.id, { status: "saving", label: candidate.label, problem: candidate.problem });
      const base = [candidate.category, candidate.name, candidate.details["Year"] || candidate.details["Set"] || ""].filter(Boolean).join(" - ");
      const upload = async (blob: Blob | undefined, side: string) => {
        if (!blob) return undefined;
        const r = await api<{ id: string; url: string }>(`/api/scan/photo?${new URLSearchParams({ category: candidate!.category, name: `${base} - ${side}` })}`, {
          method: "POST",
          body: blob,
          headers: { "content-type": "image/jpeg" },
        });
        if (!r.ok) throw r;
        return r.data;
      };
      try {
        const front = await upload(q.front, isCard(q.kind) ? "front" : "photo");
        const back = await upload(q.back, "back");
        const coa = await upload(q.coa, "certificate");
        const coaText = q.coa ? await readText(await shrink(q.coa, OCR_PX, 0.9)).catch(() => []) : [];
        const coaInfo = coaText.length ? (await import("@/lib/card-text")).parseCoa(coaText) : { authenticator: "", cert: "" };
        const r = await api<{ itemId: string; merged: boolean; quantity: number; price: number | null }>("/api/scan/save", {
          method: "POST",
          json: { candidate, condition: q.condition, location: q.location, front, back, coa, authenticator: coaInfo.authenticator, certNumber: coaInfo.cert },
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
        const err = e as { status?: number; error?: string; needsSignIn?: boolean };
        update(q.id, {
          status: err.status === 0 ? "offline" : "error",
          error: err.needsSignIn ? "Sign out and sign in again to let the app save photos to Drive." : err.error ?? "Couldn't save.",
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
          setResults((rs) => [{ id: q.id, kind: q.kind, thumb: URL.createObjectURL(q.front), status: "waiting", label: "Waiting" }, ...rs]);
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

  const finishCard = useCallback(async () => {
    const c = card.current;
    if (!c.front) return;
    card.current = {};
    setReady(null);
    const s = sessionRef.current;
    const q: QueuedScan = { id: crypto.randomUUID(), createdAt: Date.now(), kind: s.kind, location: s.location.trim(), condition: s.condition, front: c.front, back: c.back, coa: c.coa };
    await putScan(q);
    setResults((rs) => [{ id: q.id, kind: q.kind, thumb: URL.createObjectURL(q.front), status: "waiting", label: "Waiting" }, ...rs]);
    void runQueue();
  }, [runQueue]);

  // ---------- camera ----------

  const capture = useCallback(async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const s = sessionRef.current;
    const blob = await frameToBlob(v, isCard(s.kind), SAVE_PX);
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
      // A new front means the last card is done.
      if (card.current.front) await finishCard();
      card.current = { front: blob };
      if (isCard(s.kind)) {
        setStep("back");
        setHint("Flip it over");
      } else {
        setReady({ ...card.current });
        setHint("Next item, or add a certificate");
      }
      return;
    }
    card.current.back = blob;
    setReady({ ...card.current });
    setStep("front");
    setHint("Next card, or add a certificate");
  }, [finishCard]);

  // Auto-snap: when the picture holds still for half a second and differs from the last photo.
  useEffect(() => {
    if (phase !== "camera" || !auto) return;
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
      const r = cropRect(v.videoWidth, v.videoHeight, isCard(sessionRef.current.kind));
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
  }, [phase, auto, capture]);

  async function start() {
    setCamError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      stream.current = s;
      setPhase("camera");
      setStep("front");
      setHint(isCard(kind) ? "Hold a card inside the frame" : "Hold the item in view");
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      });
      wake.current = (await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch {
      setCamError("The camera isn't available. Allow camera access for this site in your browser settings, then try again.");
    }
  }

  async function stop() {
    if (card.current.front) await finishCard();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    await wake.current?.release().catch(() => {});
    wake.current = null;
    setPhase("setup");
  }

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  // Size the photo area to the camera's shape, so the frame on screen matches what's saved.
  useEffect(() => {
    const el = stage.current;
    if (!el || !dims) return;
    const fit = () => {
      const k = Math.min(el.clientWidth / dims.w, el.clientHeight / dims.h);
      setBox({ w: Math.floor(dims.w * k), h: Math.floor(dims.h * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dims, phase]);

  async function pick(r: Result, c: Candidate | null) {
    const q = (await pendingScans()).find((x) => x.id === r.id);
    if (!q) return;
    const chosen: Candidate = c ?? { ...r.candidates![0]!, name: "Unidentified card", catalogId: "", price: null, confidence: "low", problem: "none of the suggested printings matched" };
    await processOne(q, chosen);
  }

  async function changeCondition(r: Result, value: string) {
    if (!r.itemId) return;
    const res = await api(`/api/items/${r.itemId}`, { method: "PATCH", json: { condition: value } });
    update(r.id, res.ok ? { detail: `Condition set to ${value}.` } : { error: res.error });
  }

  const k = kindOf(kind);
  const counts = {
    saved: results.filter((r) => r.status === "saved").length,
    working: results.filter((r) => ["waiting", "reading", "saving"].includes(r.status)).length,
    attention: results.filter((r) => ["pick", "error", "offline"].includes(r.status)).length,
  };

  // ---------- setup ----------

  if (phase === "setup") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Scan</h1>
          <p className="text-muted">Hold each item up to the camera. It&apos;s read on your phone, saved to your sheet, and priced for free when it can be.</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium mb-2">What are you scanning?</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => {
                  setKind(x.key);
                  setCondition(x.condition);
                }}
                aria-pressed={kind === x.key}
                className={`min-h-10 rounded-full border px-4 text-sm font-medium ${kind === x.key ? "border-navy bg-navy text-navy-ink" : "border-line bg-surface text-ink"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Where are these kept?
            <input className="min-h-11 rounded-lg border border-line bg-bg px-3 text-base" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Box 12, Binder 3…" />
            <span className="text-xs font-normal text-muted">Saved with every item from this session, so you can find it later.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Condition
            <select className="min-h-11 rounded-lg border border-line bg-bg px-3 text-base" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {(categoryByName(k.category)?.conditions ?? []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted">Used for every item. Change any one afterward with a tap.</span>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5" />
          Snap automatically when the item holds still
        </label>
        {kind === "sports" && !ebayOn && (
          <p className="text-sm rounded-lg bg-navy-soft px-3 py-2">Sports cards are saved without a price until eBay is connected. Claude&apos;s nightly run prices the ones it needs to.</p>
        )}
        {camError && <p className="text-sm rounded-lg bg-bad-soft text-bad px-3 py-2">{camError}</p>}
        <button type="button" onClick={start} className="min-h-14 rounded-xl bg-navy px-6 text-lg font-medium text-navy-ink">
          Start scanning
        </button>
        {results.length > 0 && <ResultList results={results} onPick={pick} onCondition={changeCondition} conditions={categoryByName(k.category)?.conditions ?? []} />}
      </div>
    );
  }

  // ---------- camera ----------

  const prompt =
    step === "coa" ? "Hold the certificate in the frame" : step === "back" ? "Now the back" : hint || (isCard(kind) ? "Hold a card inside the frame" : "Hold the item in view");
  return (
    <div className="fixed inset-0 z-40 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 text-sm">
        <span className="truncate">
          {k.label}
          {location ? ` · ${location}` : ""}
        </span>
        <span className="tabular-nums shrink-0">
          {counts.saved} saved{counts.working ? ` · ${counts.working} working` : ""}
          {counts.attention ? ` · ${counts.attention} to check` : ""}
        </span>
      </div>
      <div ref={stage} className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <div className="relative" style={box ? { width: box.w, height: box.h } : { width: "100%", height: "100%" }}>
          <video
            ref={video}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
            className="absolute inset-0 h-full w-full object-fill"
          />
          {isCard(kind) && box && <Guide w={box.w} h={box.h} />}
          {flash && <div className="absolute inset-0 bg-white/70" />}
        </div>
        <p className="absolute top-3 inset-x-0 text-center text-lg font-medium drop-shadow" aria-live="polite">
          {prompt}
        </p>
      </div>
      <div className="px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-3 bg-black">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={stop} className="min-h-11 rounded-full bg-white/15 px-5 text-sm font-medium">
            Done
          </button>
          <button type="button" onClick={capture} aria-label="Take photo" className="h-16 w-16 rounded-full border-4 border-white bg-white/20 active:bg-white/60" />
          {step === "back" ? (
            <button
              type="button"
              onClick={() => {
                setStep("front");
                setReady({ ...card.current });
                setHint("No back. Next card.");
              }}
              className="min-h-11 rounded-full bg-white/15 px-4 text-sm font-medium"
            >
              No back
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready?.front || !!ready?.coa}
              onClick={() => setStep("coa")}
              className="min-h-11 rounded-full bg-white/15 px-4 text-sm font-medium disabled:opacity-40"
            >
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

/** The card frame on screen, the same area that's saved (see cropRect). */
function Guide({ w, h }: { w: number; h: number }) {
  const r = cropRect(w, h, true);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
      />
    </div>
  );
}

function ResultList({
  results,
  onPick,
  onCondition,
  conditions,
}: {
  results: Result[];
  onPick: (r: Result, c: Candidate | null) => void;
  onCondition: (r: Result, value: string) => void;
  conditions: string[];
}) {
  return (
    <section aria-labelledby="scanned" className="flex flex-col gap-2">
      <h2 id="scanned" className="text-xs font-medium uppercase tracking-wider text-muted">
        This session
      </h2>
      <ul className="rounded-2xl border border-line bg-surface divide-y divide-line">
        {results.map((r) => (
          <li key={r.id} className="flex gap-3 px-3 py-3">
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
                          ? "Reading the card…"
                          : r.status === "saving"
                            ? "Saving…"
                            : "Waiting…"}
              </span>
              {r.detail && <span className="text-xs text-warn">{r.detail}</span>}
              {r.status === "pick" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {r.candidates!.map((c) => (
                    <button key={c.catalogId || c.label} type="button" onClick={() => onPick(r, c)} className="min-h-9 rounded-lg border border-line px-3 text-left text-xs">
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
                    <select aria-label="Condition" defaultValue="" onChange={(e) => e.target.value && onCondition(r, e.target.value)} className="min-h-8 rounded border border-line bg-bg px-2">
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
        ))}
      </ul>
    </section>
  );
}
