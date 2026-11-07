"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GalleryPhoto = { id: string; preview: string; full: string; alt: string; driveUrl?: string | null; label?: string };

/**
 * A row of photos. Tapping one opens it full screen: swipe or use the arrow keys to move between
 * photos, pinch to zoom, and tap Close or press Escape to leave. Cards show each photo's side
 * (Front, Back) and an empty slot for a side that has no photo yet.
 */
export function PhotoGallery({ photos, missing = [] }: { photos: GalleryPhoto[]; missing?: string[] }) {
  const labeled = photos.some((p) => p.label) || missing.length > 0;
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const touch = useRef<{ x: number; y: number } | null>(null);

  const open = (i: number) => {
    setIndex(i);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const step = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + photos.length) % photos.length)),
    [photos.length],
  );

  // Load the large version in the background; show the preview until it arrives.
  useEffect(() => {
    if (index === null) return;
    const p = photos[index]!;
    if (loaded[p.id]) return;
    const img = new Image();
    img.onload = () => setLoaded((l) => ({ ...l, [p.id]: true }));
    img.src = p.full;
  }, [index, photos, loaded]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    const onClose = () => setIndex(null);
    d.addEventListener("keydown", onKey);
    d.addEventListener("close", onClose);
    return () => {
      d.removeEventListener("keydown", onKey);
      d.removeEventListener("close", onClose);
    };
  }, [step]);

  const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.05;
  const current = index === null ? null : photos[index]!;

  return (
    <>
      <section aria-label="Photos" className="flex gap-3 overflow-x-auto snap-x pb-1 -mx-1 px-1">
        {photos.map((p, n) => (
          <figure key={p.id} className="snap-start shrink-0 m-0 flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => open(n)}
              className="rounded-2xl cursor-zoom-in"
              aria-label={`View ${p.label ? p.label.toLowerCase() : `photo ${n + 1}`} full screen`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.preview}
                alt={p.alt}
                className={`${labeled ? "h-60 max-w-[44vw] sm:max-w-[85vw]" : "h-72 max-w-[85vw]"} w-auto rounded-2xl border border-line bg-navy-soft object-contain`}
              />
            </button>
            {p.label && <figcaption className="text-xs font-medium text-muted">{p.label}</figcaption>}
          </figure>
        ))}
        {missing.map((label) => (
          <figure key={label} className="snap-start shrink-0 m-0 flex flex-col items-center gap-1.5">
            <div className="h-60 w-[min(171px,44vw)] rounded-2xl border border-dashed border-line flex items-center justify-center p-3 text-center text-sm text-muted">
              No photo of the {label.toLowerCase()} yet
            </div>
            <figcaption className="text-xs font-medium text-muted">{label}</figcaption>
          </figure>
        ))}
      </section>

      <dialog
        ref={dialog}
        aria-label="Photo, full screen"
        className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none bg-black p-0 text-white backdrop:bg-black"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onTouchStart={(e) => {
          touch.current = e.touches.length === 1 && !zoomed() ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t || photos.length < 2) return;
          const dx = e.changedTouches[0]!.clientX - t.x;
          const dy = e.changedTouches[0]!.clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }}
      >
        {current && (
          <div className="relative h-full w-full flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && close()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={loaded[current.id] ? current.full : current.preview}
              alt={current.alt}
              className="max-h-full max-w-full object-contain select-none"
              style={{ touchAction: "pinch-zoom" }}
              draggable={false}
            />

            <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-3 p-3 pt-[max(12px,env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent">
              <span className="text-sm tabular-nums" aria-live="polite">
                {[current.label, photos.length > 1 ? `${index! + 1} / ${photos.length}` : ""].filter(Boolean).join(" · ")}
              </span>
              <div className="flex items-center gap-2">
                {current.driveUrl && (
                  <a href={current.driveUrl} target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center rounded-full bg-white/15 px-4 text-sm font-medium text-white no-underline">
                    Open in Drive
                  </a>
                )}
                <button type="button" onClick={close} autoFocus className="min-h-10 rounded-full bg-white/15 px-4 text-sm font-medium text-white">
                  Close
                </button>
              </div>
            </div>

            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/55 text-2xl text-white">
                  ‹
                </button>
                <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-black/55 text-2xl text-white">
                  ›
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
