import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleOf } from "@/lib/access";

/**
 * Google sends people back here after sign-in. We swap the one-time code for a session and
 * save Google's refresh token, so the app can keep using Drive and Sheets later (for example
 * during scheduled price checks) without asking you to sign in again.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${origin}/login?error=sign_in_failed`);

  const user = data.session.user;
  if (!(await roleOf(supabase, user.email))) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  const refreshToken = data.session.provider_refresh_token;
  if (refreshToken) {
    try {
      await createAdminClient()
        .from("google_tokens")
        .upsert({ user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });
    } catch (e) {
      console.error("Could not save the Google refresh token", e);
    }
  }

  // New people go to the setup checklist until their sheet is connected.
  const { data: settings } = await supabase.from("settings").select("sheet_id").eq("user_id", user.id).maybeSingle();
  return NextResponse.redirect(`${origin}${settings?.sheet_id ? "/collection" : "/setup"}`);
}
