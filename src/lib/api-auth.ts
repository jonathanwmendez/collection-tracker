import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { canAdmin, roleOf, type Role } from "./access";

type Ok = { supabase: SupabaseClient; user: User; role: Role; error?: undefined };
type Fail = { error: NextResponse; supabase?: undefined; user?: undefined };

/** Every API route starts here: the caller must be signed in and invited. */
export async function requireUser(): Promise<Ok | Fail> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: jsonError("Sign in to continue.", 401) };
  const role = await roleOf(supabase, user.email);
  if (!role) return { error: jsonError("This account doesn't have access.", 403) };
  return { supabase, user, role };
}

/** Like requireUser, for the Admin page's routes. */
export async function requireAdmin(): Promise<Ok | Fail> {
  const auth = await requireUser();
  if (auth.error) return auth;
  if (!canAdmin(auth.role)) return { error: jsonError("Only admins can do that.", 403) };
  return auth;
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}
