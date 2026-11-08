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

/** When the file (the sheet) last changed, so a sync can be skipped when nothing did. */
export async function driveModifiedTime(token: string, fileId: string): Promise<string | null> {
  const res = await googleFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=modifiedTime&supportsAllDrives=true`,
    {},
    "Google Drive",
  );
  const body = (await res.json().catch(() => ({}))) as { modifiedTime?: string };
  return body.modifiedTime ?? null;
}

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";

/** Creates a Drive folder the app owns (allowed by the drive.file permission). */
export async function createDriveFolder(token: string, name: string, parent?: string): Promise<string> {
  const res = await googleFetch(
    token,
    `${DRIVE}?fields=id`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }) },
    "Google Drive",
  );
  return ((await res.json()) as { id: string }).id;
}

/** Uploads a JPEG into a folder the app owns. Returns the file ID and a link for the sheet. */
export async function uploadDrivePhoto(token: string, folderId: string, name: string, bytes: Uint8Array): Promise<{ id: string; url: string }> {
  const boundary = `ct${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "image/jpeg" });
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: image/jpeg\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head), Buffer.from(bytes), Buffer.from(tail)]);
  const res = await googleFetch(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true",
    { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body },
    "Google Drive",
  );
  const { id } = (await res.json()) as { id: string };
  return { id, url: `https://drive.google.com/file/d/${id}/view` };
}

/** Whether a folder the app saved still exists (someone may have deleted it in Drive). */
export async function driveFolderExists(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${DRIVE}/${encodeURIComponent(id)}?fields=id,trashed`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => ({}))) as { trashed?: boolean };
  return !body.trashed;
}
