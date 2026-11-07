import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { isAllowedEmail } from "./supabase/env";

type Ok = { supabase: SupabaseClient; user: User; error?: undefined };
type Fail = { error: NextResponse; supabase?: undefined; user?: undefined };

/** Every API route starts here: the caller must be signed in and on the allowed list. */
export async function requireUser(): Promise<Ok | Fail> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAllowedEmail(user.email)) {
    return { error: jsonError("Sign in to continue.", 401) };
  }
  return { supabase, user };
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}
