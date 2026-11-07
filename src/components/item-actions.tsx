"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { PriceResult } from "@/lib/prices";
import { Notice } from "./notice";

type Msg = { kind: "ok" | "bad" | "info"; text: string; needsSignIn?: boolean; link?: string };

export function ItemActions({
  id,
  name,
  category,
  canPrice,
}: {
  id: string;
  name: string;
  category: string;
  canPrice: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function checkPrice() {
    setBusy("price");
    setMsg(null);
    const r = await api<PriceResult>(`/api/items/${id}/price`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    if (!r.data.found) return setMsg({ kind: "info", text: r.data.reason });
    setMsg({ kind: "ok", text: `$${r.data.value.toFixed(2)}: ${r.data.matched}. Saved to your sheet.`, link: r.data.url });
    router.refresh();
  }

  async function reprice() {
    setBusy("reprice");
    setMsg(null);
    const r = await api(`/api/items/${id}/reprice`, { method: "POST" });
    setBusy(null);
    if (!r.ok) return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    setMsg({ kind: "ok", text: "Queued. Claude's nightly price check (3:30 AM, on your Claude plan) will price this item from recent sales." });
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    setMsg(null);
    const r = await api(`/api/items/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) {
      setConfirming(false);
      return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    }
    router.replace("/collection");
    router.refresh();
  }

  const btn = "min-h-11 rounded-xl border border-line bg-surface px-4 font-medium disabled:opacity-50";
  return (
    <section aria-label="Actions" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Link href={`/items/${id}/edit`} className="min-h-11 inline-flex items-center rounded-xl bg-navy px-4 font-medium text-navy-ink no-underline">
          Edit
        </Link>
        {canPrice && (
          <button type="button" className={btn} onClick={checkPrice} disabled={busy !== null}>
            {busy === "price" ? "Checking…" : "Check price now"}
          </button>
        )}
        <button type="button" className={btn} onClick={reprice} disabled={busy !== null}>
          {busy === "reprice" ? "Queuing…" : "Ask Claude to reprice"}
        </button>
        {!confirming ? (
          <button type="button" className={`${btn} text-bad`} onClick={() => setConfirming(true)} disabled={busy !== null}>
            Delete
          </button>
        ) : null}
      </div>

      {confirming && (
        <div className="rounded-xl border border-bad bg-bad-soft p-3 flex flex-col gap-2 text-sm">
          <p className="text-bad">
            Delete “{name}” from the {category} tab of your sheet? The photo stays in Google Drive.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={remove} disabled={busy !== null} className="min-h-10 rounded-lg bg-bad px-4 font-medium text-white disabled:opacity-50">
              {busy === "delete" ? "Deleting…" : "Delete row"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-lg border border-line bg-surface px-4 font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <Notice kind={msg.kind} needsSignIn={msg.needsSignIn}>
          {msg.text}{" "}
          {msg.link && (
            <a href={msg.link} target="_blank" rel="noopener noreferrer">
              View listing
            </a>
          )}
        </Notice>
      )}
    </section>
  );
}
