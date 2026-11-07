import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { sheetLink } from "@/lib/collection";
import { SettingsForm } from "@/components/settings-form";
import { SyncBar } from "@/components/sync";

export const metadata = { title: "Settings · Collection Tracker" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    settings,
  ] = await Promise.all([supabase.auth.getUser(), getSettings(supabase)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-4">
        <h2 className="font-medium">Links</h2>
        <SettingsForm
          sheetUrl={settings.sheet_id ? sheetLink(settings.sheet_id) : ""}
          intakeUrl={settings.intake_url ?? ""}
          repriceDays={settings.reprice_after_days}
        />
      </section>

      {settings.sheet_id && (
        <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
          <h2 className="font-medium">Sync</h2>
          <SyncBar />
          <p className="text-sm text-muted">
            The sheet is the main copy of your collection. The app syncs when you open it and when you come back to it. Edits made in the app are
            saved to the sheet first.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        <h2 className="font-medium">Account</h2>
        <p className="text-sm">
          Signed in as <span className="font-medium">{user?.email}</span>
        </p>
        <p className="text-sm text-muted">
          While the app is in Google&apos;s Testing mode, Google ends its access 7 days after you sign in. When that happens, the app asks you to sign in
          again.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="min-h-11 rounded-xl border border-line bg-surface px-4 font-medium">
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
