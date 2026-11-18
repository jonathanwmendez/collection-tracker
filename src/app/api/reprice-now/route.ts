import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-errors";
import { ebayConfigured } from "@/lib/ebay";
import { repriceFree } from "@/lib/reprice";
import { syncCollection } from "@/lib/sync";

export const maxDuration = 300;

/**
 * Runs the free morning repricing now for the signed-in user: card databases for Magic, Pokémon and
 * Yu-Gi-Oh!, and eBay asking prices for everything else. Prices set by hand are never overwritten.
 */
export async function POST() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;
  try {
    await syncCollection(supabase, user.id, { force: true });
    // Leave room under the 300-second limit for the writes and the final sync.
    const result = await repriceFree(supabase, user.id, { deadline: Date.now() + 220_000 });
    if (result.priced > 0) await syncCollection(supabase, user.id, { force: true });
    return NextResponse.json({ ...result, ebay: ebayConfigured() });
  } catch (e) {
    return errorResponse(e, "Couldn't get prices. Try again.");
  }
}
