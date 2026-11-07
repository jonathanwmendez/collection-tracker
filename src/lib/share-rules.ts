// What a share link lets people see. Pure functions, used by the public pages and tested on their own.

export type Share = {
  id: string;
  user_id: string;
  token: string;
  title: string;
  categories: string[] | null;
  show_values: boolean;
  show_notes: boolean;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
};

export function isExpired(share: Pick<Share, "expires_at">, now = new Date()): boolean {
  return Boolean(share.expires_at && new Date(share.expires_at).getTime() <= now.getTime());
}

export function coversCategory(share: Pick<Share, "categories">, category: string): boolean {
  return !share.categories || share.categories.length === 0 || share.categories.includes(category);
}

/** Tokens are 128 random bits, base64url: long enough that links can't be guessed. */
export function looksLikeToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

export const EXPIRY_OPTIONS = { never: "Never", "7": "In 7 days", "30": "In 30 days", "90": "In 90 days" } as const;
export type Expiry = keyof typeof EXPIRY_OPTIONS;

export function expiryDate(choice: string, now = new Date()): string | null {
  const days = Number(choice);
  if (!Number.isInteger(days) || days <= 0) return null;
  return new Date(now.getTime() + days * 86400000).toISOString();
}
