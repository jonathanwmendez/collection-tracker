"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Notice } from "./notice";

export function RepriceStale({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string; needsSignIn?: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const r = await api<{ queued: number; skipped: number }>("/api/reprice-stale", { method: "POST" });
    setBusy(false);
    if (!r.ok) return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    setMsg({
      kind: "ok",
      text: `Queued ${r.data.queued} for Claude's next scheduled price check.${r.data.skipped ? ` ${r.data.skipped} skipped because their rows moved; sync and try again.` : ""}`,
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={run} disabled={busy || count === 0} className="self-start min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium disabled:opacity-50">
        {busy ? "Queuing…" : `Queue ${count} for repricing`}
      </button>
      {msg && (
        <Notice kind={msg.kind} needsSignIn={msg.needsSignIn}>
          {msg.text}
        </Notice>
      )}
    </div>
  );
}
