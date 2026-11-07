"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CATEGORIES } from "@/lib/categories";
import { shortDate, timeAgo } from "@/lib/format";
import { EXPIRY_OPTIONS, type Expiry, type Share } from "@/lib/share-rules";
import { Notice } from "./notice";

const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-base text-ink";
const btn = "min-h-9 rounded-lg border border-line bg-surface px-3 text-sm font-medium disabled:opacity-50";

export function ShareManager({ shares, origin, counts }: { shares: Share[]; origin: string; counts: Record<string, number> }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cats, setCats] = useState<string[]>(CATEGORIES.map((c) => c.name));
  const [showValues, setShowValues] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [expires, setExpires] = useState<Expiry>("never");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const link = (token: string) => `${origin}/s/${token}`;

  async function copy(token: string) {
    const url = link(token);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ title: "My collection", url });
      else await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* the person closed the share sheet */
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    const r = await api<{ id: string; token: string }>("/api/shares", {
      method: "POST",
      json: { title, categories: cats, showValues, showNotes, expires },
    });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setTitle("");
    router.refresh();
    void copy(r.data.token);
  }

  async function remove(id: string) {
    if (!window.confirm("Turn off this link? Anyone who has it won't be able to open it anymore.")) return;
    setBusy(id);
    const r = await api(`/api/shares/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }

  const toggle = (name: string) => setCats((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={create} className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-4">
        <h2 className="font-medium">New link</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Title (optional)
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="For example: Jonathan's card collection" />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium mb-1">Categories</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.name);
              return (
                <label
                  key={c.slug}
                  className={`min-h-9 inline-flex items-center gap-1.5 rounded-full border px-3 text-sm cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy ${on ? "bg-navy text-navy-ink border-navy" : "bg-surface text-ink border-line"}`}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(c.name)} />
                  {c.name}
                  {counts[c.name] ? <span className={on ? "opacity-80" : "text-muted"}>{counts[c.name]}</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-[var(--navy)]" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
            Show values
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5 accent-[var(--navy)]" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
            Show notes
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Link expires
          <select className={`${input} sm:max-w-48`} value={expires} onChange={(e) => setExpires(e.target.value as Expiry)}>
            {Object.entries(EXPIRY_OPTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        {error && <Notice kind="bad">{error}</Notice>}
        <button type="submit" disabled={busy !== null || cats.length === 0} className="self-start min-h-11 rounded-xl bg-navy px-5 font-medium text-navy-ink disabled:opacity-50">
          {busy === "create" ? "Creating…" : "Create and copy link"}
        </button>
        <p className="text-xs text-muted">
          Anyone with the link can view, without an account. Links never show your sheet, Drive links, or anything else in your Google account.
        </p>
      </form>

      <section aria-labelledby="links" className="flex flex-col gap-3">
        <h2 id="links" className="text-xs font-medium uppercase tracking-wider text-muted">
          Your links ({shares.length})
        </h2>
        {shares.length === 0 ? (
          <p className="text-sm text-muted">No links yet.</p>
        ) : (
          <ul className="rounded-2xl border border-line bg-surface divide-y divide-line">
            {shares.map((s) => {
              const expired = s.expires_at && new Date(s.expires_at) <= new Date();
              return (
                <li key={s.id} className="p-4 flex flex-col gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{s.title || "Untitled link"}</span>
                    <span className="text-xs text-muted">
                      {s.categories?.length ? s.categories.join(", ") : "All categories"}
                      {s.show_values ? " · values" : " · no values"}
                      {s.show_notes ? " · notes" : ""}
                    </span>
                    <span className="text-xs text-muted">
                      {s.view_count === 1 ? "1 view" : `${s.view_count} views`}
                      {s.last_viewed_at ? `, last ${timeAgo(s.last_viewed_at)}` : ""}
                      {" · "}
                      {expired ? <span className="text-bad">Expired</span> : s.expires_at ? `Expires ${shortDate(s.expires_at)}` : "Never expires"}
                    </span>
                  </div>
                  <code className="text-xs break-all text-muted">{link(s.token)}</code>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn} onClick={() => copy(s.token)} disabled={Boolean(expired)}>
                      {copied === s.token ? "Copied" : "Copy link"}
                    </button>
                    <a href={link(s.token)} target="_blank" rel="noopener noreferrer" className={`${btn} inline-flex items-center no-underline text-ink`}>
                      Preview
                    </a>
                    <button type="button" className={`${btn} text-bad`} onClick={() => remove(s.id)} disabled={busy !== null}>
                      Turn off
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
