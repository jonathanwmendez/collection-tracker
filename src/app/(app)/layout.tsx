import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/nav-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-3xl flex items-center justify-between gap-4 h-14 px-[max(16px,env(safe-area-inset-left))]">
          <span className="font-bold tracking-tight">Collection Tracker</span>
          <div className="hidden md:block">
            <NavBar variant="top" />
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title={`Signed in as ${user?.email ?? ""}. Sign out`}
              aria-label="Sign out"
              className="h-9 w-9 rounded-full bg-navy-soft text-ink text-xs font-medium"
            >
              {initials || "?"}
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-[max(16px,env(safe-area-inset-left))] py-6 pb-28 md:pb-10">
        {children}
      </main>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <NavBar variant="bottom" />
      </div>
    </div>
  );
}
