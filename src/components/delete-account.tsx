"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Notice } from "./notice";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const r = await api("/api/account", { method: "DELETE", json: { confirm: text } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    window.location.href = "/login";
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start min-h-11 rounded-xl border border-line bg-surface px-4 font-medium text-bad">
        Delete my account
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-bad bg-bad-soft p-3 flex flex-col gap-2 text-sm">
      <p className="text-bad">
        This deletes your account and everything the app stores for you: items, previews, price history, and settings. Your Google Sheet, Drive
        photos, and Claude setup stay as they are. Type <span className="font-mono font-medium">delete</span> to confirm.
      </p>
      <label className="sr-only" htmlFor="confirm-delete">
        Type delete to confirm
      </label>
      <input id="confirm-delete" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-base text-ink" />
      {error && <Notice kind="bad">{error}</Notice>}
      <div className="flex gap-2">
        <button type="button" onClick={run} disabled={busy || text.trim().toLowerCase() !== "delete"} className="min-h-10 rounded-lg bg-bad px-4 font-medium text-white disabled:opacity-50">
          {busy ? "Deleting…" : "Delete account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-lg border border-line bg-surface px-4 font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}
