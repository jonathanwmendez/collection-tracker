"use client";

import { useEffect, useRef, useState } from "react";
import { money, shortDate } from "@/lib/format";

type Point = { date: string; value: number };

const H = 200;
const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

/** The collection's total value over time, one point per day synced, with a hover crosshair. */
export function ValueChart({ points }: { points: Point[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the container's real width, so labels stay a readable size on phones and desktops.
  const [W, setW] = useState(360);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const lo = Math.max(0, min - (max - min) * 0.15);
  const hi = max + (max - min) * 0.1 || max + 1;
  const t0 = new Date(points[0]!.date).getTime();
  const t1 = new Date(points[points.length - 1]!.date).getTime();
  const x = (d: string) => PAD.left + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const ticks = [lo, (lo + hi) / 2, hi];

  function onMove(e: React.PointerEvent) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best]!.date) - px)) best = i;
    });
    setHover(best);
  }

  const h = hover === null ? null : points[hover]!;
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" ref={box}>
        <svg
          ref={svg}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block touch-pan-y"
          role="img"
          aria-label={`Total value from ${money(values[0])} on ${shortDate(points[0]!.date)} to ${money(values[values.length - 1])} on ${shortDate(points[points.length - 1]!.date)}`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--muted)" className="font-mono">
                {money(t, { round: true }).replace(/\.\d\d$/, "")}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 8} fontSize={12} fill="var(--muted)">
            {shortDate(points[0]!.date)}
          </text>
          <text x={W - PAD.right} y={H - 8} fontSize={12} fill="var(--muted)" textAnchor="end">
            {shortDate(points[points.length - 1]!.date)}
          </text>
          <polyline
            points={points.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")}
            fill="none"
            stroke="var(--navy)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {h && (
            <g>
              <line x1={x(h.date)} x2={x(h.date)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(h.date)} cy={y(h.value)} r={5} fill="var(--navy)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(x(h.date) / W) * 100}%`, transform: `translateX(${x(h.date) > W / 2 ? "-105%" : "5%"})` }}
          >
            <div className="text-muted">{shortDate(h.date)}</div>
            <div className="font-mono tabular-nums text-ink">{money(h.value)}</div>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Show as a table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="font-medium py-1">Date</th>
              <th className="font-medium py-1 text-right">Total value</th>
            </tr>
          </thead>
          <tbody>
            {points
              .slice()
              .reverse()
              .map((p) => (
                <tr key={p.date} className="border-t border-line">
                  <td className="py-1">{shortDate(p.date)}</td>
                  <td className="py-1 text-right font-mono tabular-nums">{money(p.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
