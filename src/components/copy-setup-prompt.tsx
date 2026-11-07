"use client";

import { useState } from "react";

/** Copies the Claude setup prompt with the viewer's time zone filled in. */
export function CopySetupPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    const text = prompt.replace(/<your time zone[^>]*>/i, tz);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="min-h-11 rounded-xl bg-navy px-4 font-medium text-navy-ink">
          {copied ? "Copied" : "Copy setup prompt"}
        </button>
        <a
          href="https://claude.ai/new"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-11 inline-flex items-center rounded-xl border border-line bg-surface px-4 font-medium text-ink no-underline"
        >
          Open Claude
        </a>
      </div>
      {failed && (
        <details open className="text-sm">
          <summary className="text-muted">Copying didn&apos;t work here. Select the text below instead.</summary>
          <textarea readOnly value={prompt} className="mt-2 w-full min-h-40 rounded-lg border border-line bg-bg p-2 text-xs font-mono" />
        </details>
      )}
    </div>
  );
}
