import { SignInButton } from "./sign-in-button";
import { supabaseConfigured } from "@/lib/supabase/env";

const MESSAGES: Record<string, string> = {
  not_allowed: "That Google account doesn't have access to this app.",
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
            Photograph an item, check what Claude found, and it&apos;s cataloged with a verified price.
          </p>
        </div>

        {message && (
          <p role="alert" className="rounded-lg bg-bad-soft text-bad px-3 py-2 text-sm">
            {message}
          </p>
        )}

        <SignInButton disabled={!ready} />

        <p className="text-xs text-muted">
          The app asks Google for access only to the photos and sheet it works with, not the rest of your Drive.
        </p>
      </div>
    </main>
  );
}
