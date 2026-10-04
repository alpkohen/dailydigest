import { createServiceRoleClient, type LimitsConfig } from "@dailydigest/db";
import type { Env } from "../env.js";

/**
 * Deletes unmatched items older than limits.yaml retention_unmatched_days
 * (never ones the owner saved or a watch linked), keeping the database
 * inside the free tier. Matched items and stories are kept.
 */
export async function runRetentionStage(env: Env, limits: LimitsConfig): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db.rpc("purge_old_unmatched_items", {
    p_owner_id: env.OWNER_ID,
    p_days: limits.pipeline.retention_unmatched_days,
  });
  if (error) throw new Error(`retention failed: ${error.message}`);
  console.log(`retention stage done: ${data ?? 0} old unmatched items deleted`);
}
