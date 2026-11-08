"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { Notice } from "./notice";
import { useSync } from "./sync";

const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-base text-ink";

export function SettingsForm({
  sheetUrl,
  intakeUrl,
  repriceDays,
  alertPct,
  gradingCost,
  claudeThreshold,
}: {
  sheetUrl: string;
  intakeUrl: string;
  repriceDays: number;
  alertPct?: number | null;
  gradingCost?: number;
  claudeThreshold?: number;
}) {
  const router = useRouter();
  const { sync } = useSync();
  const [sheet, setSheet] = useState(sheetUrl);
  const [intake, setIntake] = useState(intakeUrl);
  const [days, setDays] = useState(String(repriceDays));
  const [alert, setAlert] = useState(alertPct === null || alertPct === undefined ? "" : String(alertPct));
  const [grading, setGrading] = useState(String(gradingCost ?? 30));
  const [threshold, setThreshold] = useState(String(claudeThreshold ?? 10));
  const advanced = alertPct !== undefined;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string; needsSignIn?: boolean } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const sheetChanged = sheet.trim() !== sheetUrl;
    const r = await api<{ sheetTitle?: string; sheetNote?: string }>("/api/settings", {
      method: "POST",
      json: {
        ...(sheetChanged ? { sheet } : {}),
        intakeUrl: intake,
        repriceAfterDays: days,
        ...(advanced ? { alertChangePct: alert, gradingCost: grading, claudeThreshold: threshold } : {}),
      },
    });
    setSaving(false);
    if (!r.ok) return setMsg({ kind: "bad", text: r.error, needsSignIn: r.needsSignIn });
    setMsg({
      kind: "ok",
      text: [r.data.sheetTitle ? `Connected to “${r.data.sheetTitle}”. Syncing now.` : r.data.sheetNote ? "" : "Saved to the app and your sheet.", r.data.sheetNote]
        .filter(Boolean)
        .join(" "),
    });
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
        <span className="text-xs font-normal text-muted">The Add tab opens this page in Claude. Identifying items uses your Claude plan.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Reprice after (days)
        <input className={`${input} max-w-32`} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
        <span className="text-xs font-normal text-muted">Prices older than this are rechecked by the nightly price check. Saved to your sheet too, so both always match.</span>
      </label>
      {advanced && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email me when a price moves by (%)
            <input className={`${input} max-w-32`} type="number" min={0} max={1000} value={alert} onChange={(e) => setAlert(e.target.value)} inputMode="numeric" />
            <span className="text-xs font-normal text-muted">The nightly price check emails you when a verified price moves this much and at least $5. Use 0 to turn alerts off.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Grading cost per card ($)
            <input className={`${input} max-w-32`} type="number" min={0} step={1} value={grading} onChange={(e) => setGrading(e.target.value)} inputMode="decimal" />
            <span className="text-xs font-normal text-muted">Used to find cards worth grading. Include shipping if you like.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Claude checks sold prices over ($)
            <input className={`${input} max-w-32`} type="number" min={0} step={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
            <span className="text-xs font-normal text-muted">Cards priced for free at or above this get a real sold-price check in the nightly run. Cheaper cards keep their free price.</span>
          </label>
          <p className="text-xs text-muted">These settings are saved to your sheet&apos;s Summary tab too, so the app, the sheet, and the price check always match.</p>
        </>
      )}
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
