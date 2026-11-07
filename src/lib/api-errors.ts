import "server-only";
import { jsonError } from "./api-auth";
import { GoogleError } from "./google";
import { ItemError } from "./item-sheet";
import { SyncError } from "./sync";

/** Turns a thrown error into the JSON error the app's screens show. */
export function errorResponse(e: unknown, fallback: string) {
  if (e instanceof GoogleError) return jsonError(e.message, e.status, { needsSignIn: e.needsSignIn });
  if (e instanceof ItemError || e instanceof SyncError) return jsonError(e.message, e.status);
  console.error(fallback, e);
  return jsonError(fallback, 500);
}
