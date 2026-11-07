import Link from "next/link";

export const metadata = {
  title: "Shared collection · Collection Tracker",
  // Share links are private by default: keep them out of search engines.
  robots: { index: false, follow: false },
};

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-4 h-14 px-[max(16px,env(safe-area-inset-left))]">
          <span className="font-bold tracking-tight">Collection Tracker</span>
          <span className="text-xs rounded-full px-2.5 py-1 bg-navy-soft text-muted">View only</span>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-[max(16px,env(safe-area-inset-left))] py-6 pb-12">{children}</main>
      <footer className="mx-auto w-full max-w-3xl px-[max(16px,env(safe-area-inset-left))] pb-8 text-xs text-muted">
        Shared from Collection Tracker. <Link href="/login">Make your own</Link>
      </footer>
    </div>
  );
}
