"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORTS, type Sort } from "@/lib/collection";

export function SortSelect({ value }: { value: Sort }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Sort
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set("sort", e.target.value);
          router.replace(`${pathname}?${next}`);
        }}
        className="min-h-9 rounded-lg border border-line bg-surface px-2 text-ink text-sm"
      >
        {Object.entries(SORTS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
