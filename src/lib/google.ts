import "server-only";
import { createAdminClient } from "./supabase/admin";
import { CATEGORIES } from "./categories";
import type { SupabaseClient } from "@supabase/supabase-js";

export class GoogleError extends Error {
  constructor(
    message: string,
    public status = 502,
    public needsSignIn = false,
  ) {
    super(message);
  }
}

const ROOT_FOLDER_NAME = "Collection Tracker Photos (App)";
const FOLDER_MIME = "application/vnd.google-apps.folder";

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

const driveFetch = (token: string, url: string, init: RequestInit) => googleFetch(token, url, init, "Google Drive");

/** Downloads a Drive file the app can read (photos linked in the sheet). */
export async function downloadDriveFile(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {},
  );
  return res.arrayBuffer();
}

async function createFolder(token: string, name: string, parentId?: string): Promise<string> {
  const res = await driveFetch(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return ((await res.json()) as { id: string }).id;
}

/**
 * Makes sure the app's photo folders exist in Drive and returns the folder for a category.
 * Folder IDs are remembered in the settings table. The app can only see folders it created (drive.file).
 */
export async function ensureCategoryFolder(
  supabase: SupabaseClient,
  userId: string,
  token: string,
  category: string,
): Promise<string> {
  const { data: settings } = await supabase
    .from("settings")
    .select("drive_root_folder_id, drive_category_folders")
    .eq("user_id", userId)
    .maybeSingle();

  const folders = { ...((settings?.drive_category_folders as Record<string, string> | null) ?? {}) };
  if (folders[category]) return folders[category]!;

  let rootId = settings?.drive_root_folder_id as string | null | undefined;
  if (!rootId) {
    rootId = await createFolder(token, ROOT_FOLDER_NAME);
    // Create every category folder up front so the Drive layout matches the sheet's tabs.
    for (const c of CATEGORIES) folders[c.name] = await createFolder(token, c.name, rootId);
  }
  if (!folders[category]) folders[category] = await createFolder(token, category, rootId);

  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: userId, drive_root_folder_id: rootId, drive_category_folders: folders });
  if (error) console.error("Couldn't save Drive folder IDs", error);
  return folders[category]!;
}

/** Uploads a JPEG to Drive and returns its file ID and link. */
export async function uploadPhoto(
  token: string,
  folderId: string,
  name: string,
  bytes: ArrayBuffer,
): Promise<{ id: string; url: string }> {
  const boundary = "ct" + crypto.randomUUID().replace(/-/g, "");
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "image/jpeg" });
  const head = `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: image/jpeg\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Blob([head, new Uint8Array(bytes), tail]);

  const res = await driveFetch(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body },
  );
  const json = (await res.json()) as { id: string; webViewLink?: string };
  return { id: json.id, url: json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view` };
}

/** "Figures - Michael Jordan Triple Play - 1996.jpg", safe for Drive and for synced Windows folders. */
export function photoFileName(category: string, name: string, year: string, position: number): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim();
  const base = [clean(category), clean(name), clean(year)].filter(Boolean).join(" - ");
  return base + (position > 0 ? ` (${position + 1})` : "") + ".jpg";
}
