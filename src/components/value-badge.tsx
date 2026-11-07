import { VALUE_LABEL, type Item } from "@/lib/collection";

export function ValueBadge({ status, stale }: { status: Item["value_status"]; stale?: boolean }) {
  if (stale && status !== "estimate") {
    return <span className="rounded-full px-2 py-0.5 text-[11px] font-medium bg-warn-soft text-warn">Due for a check</span>;
  }
  const tone = {
    estimate: "bg-clay-soft text-clay-ink",
    verified: "bg-ok-soft text-ok",
    unverifiable: "bg-navy-soft text-muted",
  }[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{VALUE_LABEL[status]}</span>;
}

export function StatusBadge({ status }: { status: Item["status"] }) {
  if (status === "Keep") return null;
  const tone = status === "Sold" ? "bg-navy-soft text-muted" : "bg-navy text-navy-ink";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>;
}
