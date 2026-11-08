import Link from "next/link";

/** Layout for the public Privacy Policy and Terms pages (Google requires both before an app can be published). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-[max(16px,env(safe-area-inset-left))] py-10">
      <p className="mb-6 text-sm">
        <Link href="/login">Collection Tracker</Link>
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
      <div className="mt-8 flex flex-col gap-6 leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_section]:flex [&_section]:flex-col [&_section]:gap-2">
        {children}
      </div>
      <p className="mt-10 border-t border-line pt-4 text-sm text-muted">
        <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link>
      </p>
    </main>
  );
}

export const CONTACT_URL = "https://github.com/jonathanwmendez/collection-tracker/issues";
