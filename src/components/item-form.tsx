"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CATEGORIES, categoryByName, STATUSES } from "@/lib/categories";
import { Notice } from "./notice";

export type FormValues = {
  category: string;
  fields: Record<string, string>;
  condition: string;
  quantity: number;
  value: string;
  status: string;
  notes: string;
  paid: string;
  soldPrice: string;
  soldOn: string;
  location: string;
  authenticator: string;
  certNumber: string;
};

type Duplicate = { id: string; row: number | null; quantity: number };

const input = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-base text-ink";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-muted min-w-0";

/**
 * Edits an item (mode "edit") or adds one by hand (mode "add"). Changes are written to the
 * Google Sheet first, then to the app.
 */
export function ItemForm({ mode, itemId, initial }: { mode: "edit" | "add"; itemId?: string; initial: FormValues }) {
  const router = useRouter();
  const [v, setV] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; needsSignIn?: boolean } | null>(null);
  const [dup, setDup] = useState<Duplicate | null>(null);
  const category = categoryByName(v.category) ?? CATEGORIES[0]!;
  const conditions = v.condition && !category.conditions.includes(v.condition) ? [v.condition, ...category.conditions] : category.conditions;
  const set = (patch: Partial<FormValues>) => setV((x) => ({ ...x, ...patch }));

  function switchCategory(name: string) {
    const next = categoryByName(name)!;
    const first = v.fields[category.fields[0]!] ?? "";
    const fields: Record<string, string> = {};
    next.fields.forEach((f, n) => (fields[f] = v.fields[f] ?? (n === 0 ? first : "")));
    set({ category: name, fields, condition: next.conditions.includes(v.condition) ? v.condition : "" });
  }

  async function addToExisting(d: Duplicate) {
    setSaving(true);
    setError(null);
    const r = await api(`/api/items/${d.id}`, { method: "PATCH", json: { quantity: d.quantity + Math.max(1, v.quantity) } });
    setSaving(false);
    if (!r.ok) return setError({ message: r.error, needsSignIn: r.needsSignIn });
    router.replace(`/items/${d.id}`);
    router.refresh();
  }

  async function submit(e: React.FormEvent | null, allowDuplicate = false) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    setDup(null);
    const nameKey = category.fields[0]!;
    const details = Object.fromEntries(category.fields.slice(1).map((f) => [f, v.fields[f] ?? ""]));
    const r =
      mode === "edit"
        ? await api(`/api/items/${itemId}`, {
            method: "PATCH",
            json: {
              name: v.fields[nameKey],
              details,
              condition: v.condition,
              quantity: v.quantity,
              marketValue: v.value,
              status: v.status,
              notes: v.notes,
              paid: v.paid,
              soldPrice: v.soldPrice,
              soldOn: v.soldOn,
              location: v.location,
              authenticator: v.authenticator,
              certNumber: v.certNumber,
            },
          })
        : await api<{ id: string | null }>("/api/items", {
            method: "POST",
            json: {
              category: v.category,
              fields: v.fields,
              condition: v.condition,
              quantity: v.quantity,
              estimate: v.value,
              status: v.status,
              notes: v.notes,
              paid: v.paid,
              location: v.location,
              authenticator: v.authenticator,
              certNumber: v.certNumber,
              allowDuplicate,
            },
          });
    setSaving(false);
    if (!r.ok && r.status === 409 && r.body?.duplicate) return setDup(r.body.duplicate as Duplicate);
    if (!r.ok) return setError({ message: r.error, needsSignIn: r.needsSignIn });
    const newId = mode === "add" ? (r.data as { id: string | null }).id : itemId;
    router.replace(newId ? `/items/${newId}` : `/collection/${category.slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-4">
        {mode === "add" && (
          <label className={`${labelCls} sm:col-span-2`}>
            Category
            <select className={input} value={v.category} onChange={(e) => switchCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {category.fields.map((f, n) => {
          const list = category.suggestions?.[f];
          const listId = list ? `dl-${category.slug}-${n}` : undefined;
          return (
            <label key={f} className={`${labelCls} ${n === 0 ? "sm:col-span-2" : ""}`}>
              {f}
              {n === 0 ? " (required)" : ""}
              <input
                className={input}
                value={v.fields[f] ?? ""}
                required={n === 0}
                list={listId}
                autoComplete="off"
                onChange={(e) => set({ fields: { ...v.fields, [f]: e.target.value } })}
              />
              {list && (
                <datalist id={listId}>
                  {list.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              )}
            </label>
          );
        })}

        <label className={labelCls}>
          Condition
          <select className={input} value={v.condition} onChange={(e) => set({ condition: e.target.value })}>
            <option value="">Not set</option>
            {conditions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Qty
          <input
            className={input}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={v.quantity}
            onChange={(e) => set({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
        </label>
        <label className={labelCls}>
          <span className="text-clay-ink">{mode === "add" ? "Your estimate, each (optional)" : "Market value, each"}</span>
          <input
            className={`${input} bg-clay-soft border-clay text-clay-ink font-mono`}
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={v.value}
            placeholder="0.00"
            onChange={(e) => set({ value: e.target.value })}
          />
        </label>
        <label className={labelCls}>
          Status
          <select className={input} value={v.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Paid, each (optional)
          <input
            className={`${input} font-mono`}
            type="number"
            min={0}
            step={0.01}
            inputMode="decimal"
            value={v.paid}
            placeholder="0.00"
            onChange={(e) => set({ paid: e.target.value })}
          />
        </label>
        {mode === "edit" && v.status === "Sold" && (
          <>
            <label className={labelCls}>
              Sold for, each
              <input
                className={`${input} font-mono`}
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={v.soldPrice}
                placeholder="0.00"
                onChange={(e) => set({ soldPrice: e.target.value })}
              />
            </label>
            <label className={labelCls}>
              Sold date
              <input className={input} type="date" value={v.soldOn} onChange={(e) => set({ soldOn: e.target.value })} />
            </label>
          </>
        )}
        <label className={labelCls}>
          Location (box, binder)
          <input className={input} value={v.location} placeholder="Box 12" onChange={(e) => set({ location: e.target.value })} />
        </label>
        <label className={labelCls}>
          Certificate: authenticator
          <input className={input} value={v.authenticator} list="authenticators" placeholder="PSA/DNA, JSA, Beckett…" onChange={(e) => set({ authenticator: e.target.value })} />
          <datalist id="authenticators">
            {["PSA/DNA", "JSA", "Beckett (BAS)", "Fanatics", "Upper Deck Authenticated", "MLB Authentication", "Steiner", "Tristar", "SGC", "CGC"].map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <label className={labelCls}>
          Certificate number
          <input className={`${input} font-mono`} value={v.certNumber} onChange={(e) => set({ certNumber: e.target.value })} />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          Notes
          <textarea className={`${input} min-h-24 py-2`} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>

      <p className="text-xs text-muted">
        {mode === "add"
          ? "Saved as a new row in your sheet. Tap Check price now for a free card price, or it's priced overnight."
          : "Saved to your sheet. Changing the value marks it as set by hand, so the scheduled check leaves it until it's due again."}
      </p>

      {error && (
        <Notice kind="bad" needsSignIn={error.needsSignIn}>
          {error.message}
        </Notice>
      )}

      {dup && (
        <Notice kind="info">
          <span className="flex flex-col gap-2">
            <span>
              You already have this{dup.row ? ` (row ${dup.row} in your sheet)` : ""}, quantity {dup.quantity}.
            </span>
            <span className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => addToExisting(dup)} className="min-h-10 rounded-lg bg-navy px-3 text-sm font-medium text-navy-ink">
                Add {Math.max(1, v.quantity)} to it
              </button>
              <button type="button" disabled={saving} onClick={() => submit(null, true)} className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium">
                Add as a new row
              </button>
            </span>
          </span>
        </Notice>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-navy px-5 font-medium text-navy-ink disabled:opacity-50">
          {saving ? "Saving…" : mode === "add" ? "Add to sheet" : "Save changes"}
        </button>
        <button type="button" onClick={() => router.back()} className="min-h-11 rounded-xl border border-line bg-surface px-5 font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
