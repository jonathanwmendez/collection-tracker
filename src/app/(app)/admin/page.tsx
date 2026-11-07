import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAdmin, roleOf } from "@/lib/access";
import { loadAdminData } from "@/lib/admin-data";
import { AdminPanel } from "@/components/admin-panel";
import { Notice } from "@/components/notice";

export const metadata = { title: "Admin · Collection Tracker" };

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!canAdmin(await roleOf(supabase, user?.email))) redirect("/collection");

  const { people, requests, migrationMissing } = await loadAdminData();
  const h = await headers();
  const appUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted">Who can use the app, and how far each person is through setup.</p>
      </div>
      {migrationMissing && (
        <Notice kind="warn">
          Invites need the access tables. Run <code>supabase/migrations/0003_access.sql</code> in the Supabase SQL Editor.
        </Notice>
      )}
      <AdminPanel people={people} requests={requests} appUrl={appUrl} me={(user?.email ?? "").toLowerCase()} />
    </div>
  );
}
