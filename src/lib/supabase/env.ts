// Public Supabase settings. Both are safe to expose to the browser.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Google access requested at sign-in:
 * - spreadsheets: read and update the Collection Tracker sheet
 * - drive.readonly: show the photos Collection Intake saved to Drive
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  // Lets the Scan page save photos into folders the app creates. It can't see or change anything else.
  "https://www.googleapis.com/auth/drive.file",
].join(" ");
