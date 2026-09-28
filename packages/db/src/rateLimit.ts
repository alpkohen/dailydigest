import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  hitCount: number | null;
  degraded: boolean;
}

/**
 * Sliding-window rate limit backed by the consume_rate RPC (migration
 * 0023). Degrades open (allows the request) if the RPC itself errors -
 * a rate limiter should never be the reason a real user gets a 500.
 */
export async function consumeRateLimit(
  db: SupabaseClient,
  ownerId: string,
  bucketKey: string,
  maxPerWindow: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const { data, error } = await db.rpc("consume_rate", {
    p_owner_id: ownerId,
    p_bucket: bucketKey.slice(0, 256),
    p_window_seconds: Math.max(1, Math.min(3600, windowSeconds)),
    p_max: Math.max(1, Math.min(1000, maxPerWindow)),
  });

  if (error) {
    console.warn(`rate limit: consume_rate unavailable, allowing request: ${error.message}`);
    return { allowed: true, hitCount: null, degraded: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row?.allowed !== false, hitCount: row?.hit_count ?? null, degraded: false };
}
