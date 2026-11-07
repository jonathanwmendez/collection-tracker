// Who can use the app. Owners come from ADMIN_EMAILS in Vercel and can always sign in.
// Everyone else needs an invite (a row in the members table), managed on the Admin page.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Role = "owner" | "admin" | "member";

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Owner emails. ALLOWED_EMAILS is the older name for the same setting. */
export function ownerEmails(): string[] {
  return list(process.env.ADMIN_EMAILS ?? process.env.ALLOWED_EMAILS);
}

export function isOwner(email: string | null | undefined): boolean {
  return Boolean(email) && ownerEmails().includes(email!.toLowerCase());
}

/** The signed-in person's role, or null when they haven't been invited. */
export async function roleOf(supabase: SupabaseClient, email: string | null | undefined): Promise<Role | null> {
  if (!email) return null;
  if (isOwner(email)) return "owner";
  const { data, error } = await supabase.rpc("my_role");
  if (error) {
    console.error("Role check failed", error.message);
    return null;
  }
  return data === "admin" || data === "member" ? data : null;
}

export const canAdmin = (role: Role | null | undefined) => role === "owner" || role === "admin";

export function normalizeEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 ? s : null;
}
