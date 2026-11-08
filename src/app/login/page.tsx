import Link from "next/link";
import { RequestAccess } from "./request-access";
import { SignInButton } from "./sign-in-button";
import { supabaseConfigured } from "@/lib/supabase/env";

const MESSAGES: Record<string, string> = {
  not_allowed: "That Google account hasn't been invited yet. Request access below.",
  not_configured: "The app isn't connected to Supabase yet. Add the Supabase settings and redeploy.",
  sign_in_failed: "Sign-in didn't finish. Try again.",
  missing_code: "Sign-in didn't finish. Try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? "Something went wrong. Try again.") : null;
  const ready = supabaseConfigured();

  return (
    <main className="min-h-dvh flex items-center justify-center px-[max(16px,env(safe-area-inset-left))] py-12">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-6 rounded-full bg-navy" />
            <span className="h-2 w-6 rounded-full bg-clay" />
            <span className="h-2 w-6 rounded-full bg-muted" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">Collection Tracker</h1>
          <p className="text-muted">
            Scan your cards and collectibles, keep them in your own Google Sheet, and track what they&apos;re worth from real sales and card
            price databases.
          </p>
        </div>

        {message && (
          <p role="alert" className="rounded-lg bg-bad-soft text-bad px-3 py-2 text-sm">
            {message}
          </p>
        )}

        <SignInButton disabled={!ready} />

        <RequestAccess open={error === "not_allowed"} />

        <p className="text-xs text-muted">
          Google will ask to let the app see your Drive files, save files it creates, and edit your sheets. The app only opens your Collection
          Tracker sheet and the photos it links to, saves your scans to its own folder, and never deletes anything.
        </p>

        <p className="text-xs text-muted">
          <Link href="/demo">Try the demo</Link> · <Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link>
        </p>
      </div>
    </main>
  );
}
