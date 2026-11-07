"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_SCOPES } from "@/lib/supabase/env";

export function SignInButton({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: GOOGLE_SCOPES,
        // Ask Google for a refresh token so Drive and Sheets keep working between sign-ins.
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) {
      setError("Couldn't reach Google. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={signIn}
        disabled={disabled || busy}
        className="min-h-12 rounded-xl bg-navy text-navy-ink font-medium text-base px-5 disabled:opacity-50"
      >
        {busy ? "Opening Google…" : "Sign in with Google"}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
