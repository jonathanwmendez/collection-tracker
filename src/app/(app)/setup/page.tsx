import Link from "next/link";
import setupFile from "../../../../claude/SETUP.md";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/data";
import { sheetLink } from "@/lib/collection";
import { CopySetupPrompt } from "@/components/copy-setup-prompt";
import { SettingsForm } from "@/components/settings-form";
import { SyncBar } from "@/components/sync";

export const metadata = { title: "Setup · Collection Tracker" };

/** The part of claude/SETUP.md that gets pasted into Claude. */
const PROMPT = setupFile.split(/\n---\n/).slice(1).join("\n---\n").trim();

export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [settings, { count }, token] = await Promise.all([
    getSettings(supabase),
    supabase.from("items").select("id", { count: "exact", head: true }),
    createAdminClient().from("google_tokens").select("user_id").eq("user_id", user!.id).maybeSingle(),
  ]);

  const steps = [
    {
      title: "Connect Google",
      done: Boolean(token.data),
      body: token.data ? (
        "Google access is saved, so the app can read your sheet and photos."
      ) : (
        <>
          Google access wasn&apos;t saved.{" "}
          <span className="text-ink">Sign out from Settings, sign in again, and allow every permission Google asks for.</span>
        </>
      ),
    },
    {
      title: "Set up Collection Intake and the price check in Claude",
      done: Boolean(settings.intake_url),
      body: (
        <div className="flex flex-col gap-3">
          <p>
            You&apos;ll need a Claude plan with the <span className="text-ink">Google Drive</span> and <span className="text-ink">Google Sheets</span>{" "}
            connectors turned on. Copy the prompt, paste it into a new Claude conversation, and Claude builds your sheet, photo folders, nightly
            price check, and Collection Intake page. It ends by giving you two links.
          </p>
          <CopySetupPrompt prompt={PROMPT} />
        </div>
      ),
    },
    {
      title: "Paste your two links",
      done: Boolean(settings.sheet_id && settings.intake_url),
      body: (
        <SettingsForm
          sheetUrl={settings.sheet_id ? sheetLink(settings.sheet_id) : ""}
          intakeUrl={settings.intake_url ?? ""}
          repriceDays={settings.reprice_after_days}
        />
      ),
    },
    {
      title: "First sync",
      done: Boolean(settings.last_synced_at),
      body: settings.sheet_id ? <SyncBar /> : "Starts on its own once your sheet is connected.",
    },
    {
      title: "Add your first item",
      done: (count ?? 0) > 0,
      body: (
        <Link href="/add" className="text-sm">
          Open the Add tab
        </Link>
      ),
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Setup</h1>
        <p className="text-muted">{remaining === 0 ? "You're all set." : `${remaining} of ${steps.length} steps left. Takes about 10 minutes.`}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-line bg-surface p-4 flex gap-3">
            <span
              aria-hidden="true"
              className={`h-7 w-7 shrink-0 rounded-full grid place-items-center text-sm font-medium ${s.done ? "bg-ok-soft text-ok" : "bg-navy-soft text-ink"}`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              <h2 className="font-medium">
                {s.title}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </h2>
              <div className="text-sm text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>

      {remaining === 0 && (
        <Link href="/collection" className="self-start min-h-11 inline-flex items-center rounded-xl bg-navy px-5 font-medium text-navy-ink no-underline">
          Go to your collection
        </Link>
      )}
    </div>
  );
}
