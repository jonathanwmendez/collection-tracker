"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { money, plural, timeAgo } from "@/lib/format";
import type { AccessRequest, Person } from "@/lib/admin-data";
import { Notice } from "./notice";

const GOOGLE_TEST_USERS = "https://console.cloud.google.com/auth/audience";
const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-base text-ink";
const smallBtn = "min-h-9 rounded-lg border border-line bg-surface px-3 text-sm font-medium disabled:opacity-50";
const smallPrimary = "min-h-9 rounded-lg border border-navy bg-navy px-3 text-sm font-medium text-navy-ink disabled:opacity-50";

type Msg = { kind: "ok" | "bad"; text: React.ReactNode };

export function AdminPanel({ people, requests, appUrl, me }: { people: Person[]; requests: AccessRequest[]; appUrl: string; me: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");

  function invited(addr: string) {
    const text = `You're invited to Collection Tracker. Open ${appUrl} and sign in with Google using ${addr}. The setup checklist walks you through the rest.`;
    setMsg({
      kind: "ok",
      text: (
        <span className="flex flex-col gap-2">
          <span>
            Invited {addr}. Next, add them as a test user in{" "}
            <a href={GOOGLE_TEST_USERS} target="_blank" rel="noopener noreferrer">
              Google Auth Platform &gt; Audience
            </a>
            . Google blocks sign-in until you do.
          </span>
          <button type="button" className={`${smallBtn} self-start`} onClick={() => navigator.clipboard?.writeText(text)}>
            Copy invite message
          </button>
        </span>
      ),
    });
  }

  async function invite(addr: string, r: "member" | "admin", key: string) {
    setBusy(key);
    setMsg(null);
    const res = await api("/api/admin/members", { method: "POST", json: { email: addr, role: r } });
    setBusy(null);
    if (!res.ok) return setMsg({ kind: "bad", text: res.error });
    setEmail("");
    invited(addr);
    router.refresh();
  }

  async function call(path: string, method: string, json: unknown, key: string, done?: string) {
    setBusy(key);
    setMsg(null);
    const res = await api(path, { method, json });
    setBusy(null);
    if (!res.ok) return setMsg({ kind: "bad", text: res.error });
    if (done) setMsg({ kind: "ok", text: done });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <section aria-labelledby="requests" className="flex flex-col gap-3">
        <h2 id="requests" className="text-xs font-medium uppercase tracking-wider text-muted">
          Access requests ({requests.length})
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">No requests. People can ask for access on the login page.</p>
        ) : (
          <ul className="rounded-2xl border border-line bg-surface divide-y divide-line">
            {requests.map((r) => (
              <li key={r.email} className="p-4 flex flex-col gap-2">
                <div className="flex flex-col">
                  <span className="font-medium break-all">{r.name || r.email}</span>
                  {r.name && <span className="text-sm text-muted break-all">{r.email}</span>}
                  <span className="text-xs text-muted">Asked {timeAgo(r.created_at)}</span>
                </div>
                {r.note && <p className="text-sm whitespace-pre-wrap">{r.note}</p>}
                <div className="flex gap-2">
                  <button type="button" className={smallPrimary} disabled={busy !== null} onClick={() => invite(r.email, "member", `approve:${r.email}`)}>
                    {busy === `approve:${r.email}` ? "Approving…" : "Approve"}
                  </button>
                  <button type="button" className={smallBtn} disabled={busy !== null} onClick={() => call("/api/admin/requests", "DELETE", { email: r.email }, `dismiss:${r.email}`, `Dismissed ${r.email}.`)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="invite" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        <h2 id="invite" className="font-medium">
          Invite someone
        </h2>
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void invite(email.trim().toLowerCase(), role, "invite");
          }}
        >
          <label className="sr-only" htmlFor="invite-email">
            Google account email
          </label>
          <input id="invite-email" className={input} type="email" required placeholder="their Google account email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="sr-only" htmlFor="invite-role">
            Role
          </label>
          <select id="invite-role" className={`${input} sm:w-36`} value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" disabled={busy !== null} className="min-h-11 rounded-xl bg-navy px-4 font-medium text-navy-ink disabled:opacity-50">
            {busy === "invite" ? "Inviting…" : "Invite"}
          </button>
        </form>
        <p className="text-xs text-muted">
          While the app is in Google&apos;s Testing mode, everyone also needs to be a test user (up to 100). Google doesn&apos;t let apps change that list,
          so add them in{" "}
          <a href={GOOGLE_TEST_USERS} target="_blank" rel="noopener noreferrer">
            Google Auth Platform &gt; Audience
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="people" className="flex flex-col gap-3">
        <h2 id="people" className="text-xs font-medium uppercase tracking-wider text-muted">
          People ({people.length})
        </h2>
        <ul className="rounded-2xl border border-line bg-surface divide-y divide-line">
          {people.map((p) => {
            const steps = [
              { label: "Signed in", done: Boolean(p.lastSignIn) },
              { label: "Google", done: p.google },
              { label: "Sheet", done: p.sheet },
              { label: "Intake", done: p.intake },
              { label: "Synced", done: Boolean(p.lastSynced) },
            ];
            const self = p.email === me;
            return (
              <li key={p.email} className="p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium break-all">
                    {p.email}
                    {self ? <span className="text-muted font-normal"> (you)</span> : null}
                  </span>
                  <span className="text-xs rounded-full px-2 py-0.5 bg-navy-soft">{p.role === "owner" ? "Owner" : p.role === "admin" ? "Admin" : "Member"}</span>
                </div>
                <ul className="flex flex-wrap gap-1.5" aria-label="Setup progress">
                  {steps.map((s) => (
                    <li key={s.label} className={`text-[11px] rounded-full px-2 py-0.5 ${s.done ? "bg-ok-soft text-ok" : "bg-bg text-muted border border-line"}`}>
                      {s.done ? "✓ " : ""}
                      {s.label}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">
                  {p.lastSignIn ? `Last sign-in ${timeAgo(p.lastSignIn)}` : "Hasn't signed in yet"}
                  {p.items ? ` · ${plural(p.items, "item")}, ${money(p.value, { round: true })}` : ""}
                  {p.lastSynced ? ` · synced ${timeAgo(p.lastSynced)}` : ""}
                </p>
                {p.role !== "owner" && !self && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={smallBtn}
                      disabled={busy !== null}
                      onClick={() =>
                        call("/api/admin/members", "POST", { email: p.email, role: p.role === "admin" ? "member" : "admin" }, `role:${p.email}`, `Updated ${p.email}.`)
                      }
                    >
                      {p.role === "admin" ? "Make member" : "Make admin"}
                    </button>
                    <button
                      type="button"
                      className={`${smallBtn} text-bad`}
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(`Remove access for ${p.email}? Their data stays until they delete their account.`))
                          void call("/api/admin/members", "DELETE", { email: p.email }, `remove:${p.email}`, `Removed access for ${p.email}.`);
                      }}
                    >
                      Remove access
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
