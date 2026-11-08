"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/scan", label: "Add", icon: CameraIcon, also: ["/add"] },
  { href: "/collection", label: "Collection", icon: GridIcon, also: ["/items", "/share"] },
  { href: "/value", label: "Value", icon: ChartIcon, also: [] as string[] },
];

const isActive = (pathname: string, t: (typeof TABS)[number]) =>
  [t.href, ...t.also].some((p) => pathname === p || pathname.startsWith(p + "/"));

export function NavBar({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();

  if (variant === "top") {
    return (
      <nav aria-label="Main" className="flex gap-1">
        {TABS.map((t) => {
          const active = isActive(pathname, t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium no-underline ${
                active ? "bg-navy-soft text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="grid grid-cols-3">
      {TABS.map((t) => {
        const active = isActive(pathname, t);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs no-underline ${
              active ? "text-ink font-medium" : "text-muted"
            }`}
          >
            <Icon active={active} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} aria-hidden="true">
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M5 15l4-4 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
