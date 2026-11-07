import Link from "next/link";
import { categoryByName } from "@/lib/categories";
import { itemTotal, marketLink } from "@/lib/collection";
import { money, shortDate } from "@/lib/format";
import { getShare, getSharedItem } from "@/lib/shares";
import { Unavailable } from "../../unavailable";

export default async function SharedItemPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const share = await getShare(token);
  const item = share ? await getSharedItem(share, id) : null;
  if (!share || !item) return <Unavailable />;

  const category = categoryByName(item.category);
  const back = `/s/${token}${category ? `?category=${category.slug}` : ""}`;
  const rows: Array<[string, string]> = [
    ...(category?.fields.slice(1) ?? []).map((f) => [f, item.details[f] ?? ""] as [string, string]),
    ["Condition", item.condition ?? ""],
    ["Qty", String(item.quantity)],
  ];
  const market = marketLink(item);

  return (
    <article className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={back} className="text-sm">
          ← {item.category}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{item.name}</h1>
      </div>

      {item.photos.length > 0 && (
        <section aria-label="Photos" className="flex gap-3 overflow-x-auto snap-x pb-1 -mx-1 px-1">
          {item.photos.map((p, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={`/api/share/${token}/photos/${p.id}`}
              alt={`${item.name}, photo ${n + 1}`}
              className="snap-start shrink-0 h-72 w-auto max-w-[85vw] rounded-2xl border border-line bg-navy-soft object-contain"
            />
          ))}
        </section>
      )}

      {share.show_values && (
        <section aria-label="Value" className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-1">
          <span className="text-xs text-muted">Market value{item.quantity > 1 ? ", each" : ""}</span>
          <span className="text-3xl font-medium font-mono tabular-nums">{money(item.market_value)}</span>
          <span className="text-sm text-muted">
            {item.quantity > 1 && item.market_value !== null ? `${money(itemTotal(item))} for ${item.quantity}. ` : ""}
            {item.value_status === "estimate"
              ? "Estimate, not yet checked against sales."
              : item.last_checked
                ? `Checked against recent sales ${shortDate(item.last_checked)}.`
                : ""}
          </span>
        </section>
      )}

      <dl className="rounded-2xl border border-line bg-surface divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v || <span className="text-muted">None</span>}</dd>
          </div>
        ))}
      </dl>

      {share.show_notes && item.notes && (
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm whitespace-pre-wrap">{item.notes}</p>
      )}

      <a href={market.url} target="_blank" rel="noopener noreferrer" className="text-sm">
        Search {market.label}
      </a>
    </article>
  );
}
