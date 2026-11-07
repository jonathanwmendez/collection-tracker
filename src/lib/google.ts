import "server-only";
import { createAdminClient } from "./supabase/admin";

export class GoogleError extends Error {
  constructor(
    message: string,
    public status = 502,
    public needsSignIn = false,
  ) {
    super(message);
  }
}


/**
 * Trades the saved refresh token for a short-lived Google access token.
 * In Testing mode Google expires refresh tokens 7 days after sign-in; then this asks you to sign in again.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleError("Google isn't fully set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel.", 503);
  }

  const { data, error } = await createAdminClient()
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new GoogleError("Couldn't read your Google connection.", 500);
  if (!data) throw new GoogleError("Sign out and sign in again to reconnect Google Drive.", 401, true);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Google token refresh failed", res.status, body.slice(0, 300));
    if (/invalid_grant/.test(body)) {
      throw new GoogleError("Your Google connection expired. Sign out and sign in again.", 401, true);
    }
    throw new GoogleError("Couldn't reach Google right now. Try again.", 502);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Calls a Google API with the user's token and turns failures into plain-language errors. */
export async function googleFetch(token: string, url: string, init: RequestInit = {}, what = "Google"): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`${what} error`, res.status, body.slice(0, 300));
    if (res.status === 401) {
      throw new GoogleError("Your Google connection expired. Sign out and sign in again.", 401, true);
    }
    if (res.status === 403) {
      if (/has not been used|is disabled|SERVICE_DISABLED/i.test(body)) {
        throw new GoogleError(`The ${what} API isn't turned on in your Google Cloud project yet.`, 503);
      }
      if (/insufficient|scope/i.test(body)) {
        throw new GoogleError(`The app doesn't have permission to use ${what} yet. Sign out, sign in again, and allow access.`, 403, true);
      }
      throw new GoogleError(`${what} refused the request. Check that your Google account can open this file.`, 403);
    }
    if (res.status === 404) throw new GoogleError(`${what} couldn't find that file. Check the link in Settings.`, 404);
    if (res.status === 429) throw new GoogleError(`${what} is rate limiting requests. Try again in a minute.`, 429);
    throw new GoogleError(`${what} didn't respond properly. Try again.`, 502);
  }
  return res;
}

/** Downloads a Drive file the app can read (photos linked in the sheet). */
export async function downloadDriveFile(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await googleFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {},
    "Google Drive",
  );
  return res.arrayBuffer();
}
