"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Notice } from "./notice";
import { useSync } from "./sync";

const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-base text-ink";

export function SettingsForm({ sheetUrl, intakeUrl, repriceDays }: { sheetUrl: string; intakeUrl: string; repriceDays: number }) {
  const router = useRouter();
  const { sync } = useSync();
  const [sheet, setSheet] = useState(sheetUrl);
  const [intake, setIntake] = useState(intakeUrl);
  const [days, setDays] = useState(String(repriceDays));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string; needsSignIn?: boolean } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const sheetChanged = sheet.trim() !== sheetUrl;
    const r = await api<{ sheetTitle?: string }>("/api/settings", {
      method: "POST",
      json: { ...(sheetChanged ? { sheet } : {}), intakeUrl: intake, repriceAfterDays: days },
    });
    setSaving(false);
    if (!r.ok) return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    setMsg({ kind: "ok", text: r.data.sheetTitle ? `Connected to “${r.data.sheetTitle}”. Syncing now.` : "Saved." });
    // Once the page knows a sheet is connected, the sync provider runs the first sync on its own.
    router.refresh();
    if (sheetChanged && sheetUrl) void sync();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Google Sheet link
        <input className={input} value={sheet} onChange={(e) => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" inputMode="url" required />
        <span className="text-xs font-normal text-muted">Open your Collection Tracker sheet and copy the address from the browser.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Collection Intake link
        <input className={input} value={intake} onChange={(e) => setIntake(e.target.value)} placeholder="https://claude.ai/artifact/…" inputMode="url" />
        <span className="text-xs font-normal text-muted">The Add tab opens this page in Claude, so identifying items uses your Claude plan.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Reprice after (days)
        <input className={`${input} max-w-32`} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
        <span className="text-xs font-normal text-muted">Prices older than this are flagged as due for another check.</span>
      </label>
      {msg && (
        <Notice kind={msg.kind} needsSignIn={msg.needsSignIn}>
          {msg.text}
        </Notice>
      )}
      <button type="submit" disabled={saving} className="self-start min-h-11 rounded-xl bg-navy px-5 font-medium text-navy-ink disabled:opacity-50">
        {saving ? "Checking the sheet…" : "Save"}
      </button>
    </form>
  );
}
