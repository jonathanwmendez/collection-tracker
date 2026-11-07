import type { Photo } from "@/lib/collection";

/** A square photo preview, or the item's initials when it has no photo. */
export function ItemThumb({ photo, name, size = 64 }: { photo?: Photo; name: string; size?: number }) {
  const style = { width: size, height: size };
  if (!photo) {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
    return (
      <div style={style} aria-hidden="true" className="shrink-0 rounded-lg bg-navy-soft text-muted grid place-items-center text-sm font-medium">
        {initials}
      </div>
    );
  }
  return (
    // Previews come from the app's own route (Drive photo shrunk once, then cached), so next/image isn't needed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/photos/${photo.id}/preview`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      style={style}
      className="shrink-0 rounded-lg object-cover bg-navy-soft border border-line"
    />
  );
}
