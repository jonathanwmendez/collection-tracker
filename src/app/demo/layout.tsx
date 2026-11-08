import Link from "next/link";

export const metadata = {
  title: "Demo · Collection Tracker",
  description: "A sample collection in Collection Tracker: a scanner you can try, values from real sales and card price guides, price history, profit, and grading candidates.",
};

const tab = "min-h-9 inline-flex items-center rounded-full px-3 text-sm font-medium no-underline";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header data-app-header className="print:hidden sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-3 h-14 px-[max(16px,env(safe-area-inset-left))]">
          <Link href="/demo" className="font-bold tracking-tight text-ink no-underline truncate">
            Collection Tracker
          </Link>
          <nav aria-label="Demo" className="flex gap-1">
            <Link href="/demo" className={`${tab} text-ink`}>
              Collection
            </Link>
            <Link href="/demo/value" className={`${tab} text-ink`}>
              Value
            </Link>
            <Link href="/demo/scan" className={`${tab} text-ink`}>
              Scan
            </Link>
          </nav>
        </div>
      </header>
      <div className="print:hidden bg-navy-soft border-b border-line">
        <p className="mx-auto max-w-3xl px-[max(16px,env(safe-area-inset-left))] py-2 text-sm">
          <span className="font-medium">Demo with sample data.</span> Values and dates are made up.{" "}
          <a href="https://github.com/jonathanwmendez/collection-tracker" target="_blank" rel="noopener noreferrer">
            How it&apos;s built
          </a>
          {" · "}
          <Link href="/login">Request access</Link>
        </p>
      </div>
      <main className="flex-1 mx-auto w-full max-w-3xl px-[max(16px,env(safe-area-inset-left))] py-6 pb-12">{children}</main>
    </div>
  );
}
