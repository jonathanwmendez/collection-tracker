"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Notice } from "./notice";

type Result = { checked: number; priced: number; skipped: number; outOfTime: boolean; ebay: boolean };

/** Runs the free morning repricing now instead of waiting for 9 AM. */
export function RepriceNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string; needsSignIn?: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await api<Result>("/api/reprice-now", { method: "POST" });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    const d = r.data;
    const parts = [
      d.checked === 0 ? "Nothing needed a price right now." : `Priced ${d.priced} of ${d.checked}.`,
      d.checked > d.priced ? `${d.checked - d.priced} had too few matching listings; they're tried again each morning.` : "",
      d.skipped > d.checked - d.priced ? "Some rows moved in the sheet; they'll be priced after the next sync." : "",
      d.outOfTime ? "Ran out of time; the rest are priced tomorrow morning." : "",
      d.ebay ? "" : "eBay isn't connected, so only Magic, Pokémon and Yu-Gi-Oh! cards were priced.",
    ];
    setMsg({ kind: "ok", text: parts.filter(Boolean).join(" ") });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={run} disabled={busy} className="self-start min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium disabled:opacity-50">
        {busy ? "Getting prices… (up to a few minutes)" : "Get prices now"}
      </button>
      {msg && (
        <Notice kind={msg.kind} needsSignIn={msg.needsSignIn}>
          {msg.text}
        </Notice>
      )}
    </div>
  );
}
