"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Side = "front" | "back" | "coa";

async function shrink(file: Blob, maxPx = 1600, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that photo."))), "image/jpeg", quality));
}

/** Buttons to take or pick a photo and attach it to an item later: a front, a card's back, or a certificate. */
export function AddPhoto({ itemId, category, name, sides }: { itemId: string; category: string; name: string; sides: Array<{ side: Side; label: string }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [side, setSide] = useState<Side | null>(null);
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState("");

  const pick = (s: Side) => {
    setSide(s);
    setError("");
    input.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (!file || !side) return;
    setBusy(side);
    try {
      const jpeg = await shrink(file);
      const suffix = side === "coa" ? "coa" : side;
      const up = await fetch(`/api/scan/photo?${new URLSearchParams({ category, name: `${name} - ${suffix}` })}`, {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: jpeg,
      });
      const saved = (await up.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!up.ok || !saved.id) throw new Error(saved.error ?? "Couldn't save the photo to Drive.");
      const res = await fetch(`/api/items/${itemId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ side, fileId: saved.id }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't add the photo.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the photo.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  if (!sides.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {sides.map((s) => (
          <button
            key={s.side}
            type="button"
            disabled={busy !== null}
            onClick={() => pick(s.side)}
            className="min-h-10 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink disabled:opacity-50"
          >
            {busy === s.side ? "Saving…" : s.label}
          </button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
