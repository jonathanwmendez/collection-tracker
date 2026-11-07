"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { PriceResult } from "@/lib/prices";
import { Notice } from "./notice";

type Line = { name: string; text: string; ok: boolean };

/** Checks every card in the list against the free card price database, one at a time. */
export function CheckAllPrices({ items, source }: { items: Array<{ id: string; name: string }>; source: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [fatal, setFatal] = useState<{ message: string; needsSignIn?: boolean } | null>(null);

  async function run() {
    setRunning(true);
    setDone(0);
    setLines([]);
    setFatal(null);
    for (const [n, item] of items.entries()) {
      const r = await api<PriceResult>(`/api/items/${item.id}/price`, { method: "POST" });
      if (!r.ok) {
        if (r.needsSignIn || r.status === 409) {
          setFatal({ message: r.error, needsSignIn: r.needsSignIn });
          break;
        }
        setLines((l) => [...l, { name: item.name, text: r.error, ok: false }]);
      } else if (r.data.found) {
        setLines((l) => [...l, { name: item.name, text: `$${r.data.found ? r.data.value.toFixed(2) : ""}`, ok: true }]);
      } else {
        setLines((l) => [...l, { name: item.name, text: r.data.found ? "" : r.data.reason, ok: false }]);
      }
      setDone(n + 1);
    }
    setRunning(false);
    router.refresh();
  }

  const found = lines.filter((l) => l.ok).length;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-medium">Free price check</span>
          <span className="text-sm text-muted">Near-mint market prices from {source}. Doesn&apos;t use your Claude plan.</span>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running || items.length === 0}
          className="min-h-11 rounded-xl bg-navy px-4 font-medium text-navy-ink disabled:opacity-50"
        >
          {running ? `Checking ${done + 1} of ${items.length}…` : `Check ${items.length === 1 ? "1 card" : `${items.length} cards`}`}
        </button>
      </div>
      {fatal && (
        <Notice kind="bad" needsSignIn={fatal.needsSignIn}>
          {fatal.message}
        </Notice>
      )}
      {lines.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          {!running && (
            <p className="text-muted">
              Found prices for {found} of {lines.length}. Saved to your sheet.
            </p>
          )}
          <ul className="flex flex-col gap-1 max-h-56 overflow-auto">
            {lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">{l.name}</span>
                <span className={l.ok ? "font-mono tabular-nums text-ok shrink-0" : "text-muted text-right"}>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
