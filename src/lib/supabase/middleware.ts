import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAdmin, roleOf } from "../access";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

const PUBLIC_PATHS = ["/login", "/auth"];
// Open to anyone, signed in or not: share links (checked by their token), access requests, the demo,
// and the daily sync (checked by CRON_SECRET).
const OPEN_PATHS = ["/s", "/api/share", "/api/access-requests", "/demo", "/api/cron"];

/** Refreshes the session cookie on every request and keeps out anyone who isn't signed in and allowed. */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (OPEN_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.next({ request });
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!supabaseConfigured()) {
    if (isPublic) return NextResponse.next({ request });
    return redirectTo(request, "/login", { error: "not_configured" });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return isPublic ? response : withCookies(response, redirectTo(request, "/login"));
  }

  const role = await roleOf(supabase, user.email);
  if (!role) {
    await supabase.auth.signOut();
    return withCookies(response, redirectTo(request, "/login", { error: "not_allowed" }));
  }
  if ((path === "/admin" || path.startsWith("/admin/")) && !canAdmin(role)) {
    return withCookies(response, redirectTo(request, "/collection"));
  }

  if (path === "/login") return withCookies(response, redirectTo(request, "/collection"));
  return response;
}

function redirectTo(request: NextRequest, pathname: string, params?: Record<string, string>) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = params ? new URLSearchParams(params).toString() : "";
  return NextResponse.redirect(url);
}

/** Carries refreshed or cleared session cookies over to a redirect response. */
function withCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => to.cookies.set(c));
  return to;
}
