import "server-only";
import { ownerEmails } from "./access";
import { createAdminClient } from "./supabase/admin";

export type Person = {
  email: string;
  role: "owner" | "admin" | "member";
  invitedAt: string | null;
  lastSignIn: string | null;
  google: boolean;
  sheet: boolean;
  intake: boolean;
  lastSynced: string | null;
  items: number;
  value: number;
};

export type AccessRequest = { email: string; name: string; note: string; created_at: string };

/** Everything the Admin page shows. Uses the secret key, so only call it after checking the caller is an admin. */
export async function loadAdminData(): Promise<{ people: Person[]; requests: AccessRequest[]; migrationMissing: boolean }> {
  const admin = createAdminClient();
  const [members, requests, users, settings, tokens, totals] = await Promise.all([
    admin.from("members").select("email, role, created_at"),
    admin.from("access_requests").select("email, name, note, created_at").order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("settings").select("user_id, sheet_id, intake_url, last_synced_at"),
    admin.from("google_tokens").select("user_id"),
    admin.from("category_totals").select("user_id, items, total_value"),
  ]);
  const migrationMissing = Boolean(members.error || requests.error);

  const userByEmail = new Map((users.data?.users ?? []).map((u) => [(u.email ?? "").toLowerCase(), u]));
  const settingsBy = new Map((settings.data ?? []).map((s) => [s.user_id as string, s]));
  const tokenSet = new Set((tokens.data ?? []).map((t) => t.user_id as string));
  const totalsBy = new Map<string, { items: number; value: number }>();
  for (const t of totals.data ?? []) {
    const cur = totalsBy.get(t.user_id as string) ?? { items: 0, value: 0 };
    cur.items += Number(t.items);
    cur.value += Number(t.total_value);
    totalsBy.set(t.user_id as string, cur);
  }

  const rows: Array<{ email: string; role: Person["role"]; created_at: string | null }> = [
    ...ownerEmails().map((email) => ({ email, role: "owner" as const, created_at: null })),
    ...(members.data ?? [])
      .filter((m) => !ownerEmails().includes(m.email))
      .map((m) => ({ email: m.email as string, role: m.role as "admin" | "member", created_at: m.created_at as string })),
  ];

  const people = rows.map((r) => {
    const u = userByEmail.get(r.email);
    const s = u ? settingsBy.get(u.id) : undefined;
    const t = u ? totalsBy.get(u.id) : undefined;
    return {
      email: r.email,
      role: r.role,
      invitedAt: r.created_at,
      lastSignIn: u?.last_sign_in_at ?? null,
      google: u ? tokenSet.has(u.id) : false,
      sheet: Boolean(s?.sheet_id),
      intake: Boolean(s?.intake_url),
      lastSynced: (s?.last_synced_at as string | null) ?? null,
      items: t?.items ?? 0,
      value: t?.value ?? 0,
    };
  });

  return { people, requests: (requests.data ?? []) as AccessRequest[], migrationMissing };
}
