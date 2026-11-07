"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";

const input = "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink";

/** Lets someone without access ask for an invite. No sign-in needed. */
export function RequestAccess({ open }: { open?: boolean }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api("/api/access-requests", { method: "POST", json: Object.fromEntries(form) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg bg-ok-soft text-ok px-3 py-2 text-sm">
        Request sent. You&apos;ll be able to sign in once the owner approves it.
      </p>
    );
  }

  return (
    <details open={open} className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-medium">New here? Request access</summary>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Google account email
          <input className={input} name="email" type="email" autoComplete="email" required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input className={input} name="name" autoComplete="name" maxLength={100} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Note (optional)
          <textarea className={`${input} min-h-20 py-2`} name="note" maxLength={500} />
        </label>
        {/* Hidden from people; bots tend to fill it in. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl border border-line bg-bg px-4 font-medium disabled:opacity-50">
          {busy ? "Sending…" : "Send request"}
        </button>
        <p className="text-xs text-muted">
          To use the app you&apos;ll also need a Claude plan with the Google Drive and Google Sheets connectors.
        </p>
      </form>
    </details>
  );
}
