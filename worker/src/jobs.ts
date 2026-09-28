import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 3;
// A worker process that dies mid-job (crash, CI timeout, manual kill while
// testing) leaves that job in "claimed" forever - nothing ever reclaimed
// it. A full-system audit found a real job stuck in "claimed" for hours.
// Anything claimed longer than this is assumed abandoned and freed back to
// "pending" so a later run can pick it up.
const STUCK_JOB_MINUTES = 15;

async function reclaimStuckJobs(db: SupabaseClient, ownerId: string, stage: string): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_JOB_MINUTES * 60 * 1000).toISOString();
  await db
    .from("jobs")
    .update({ status: "pending" })
    .eq("owner_id", ownerId)
    .eq("stage", stage)
    .eq("status", "claimed")
    .lt("locked_at", cutoff);
}

export interface JobRow {
  id: string;
  stage: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function enqueueJobs(
  db: SupabaseClient,
  params: { ownerId: string; runId: string; stage: string; payloads: Record<string, unknown>[] },
): Promise<void> {
  if (params.payloads.length === 0) return;
  const { error } = await db.from("jobs").insert(
    params.payloads.map((payload) => ({
      owner_id: params.ownerId,
      run_id: params.runId,
      stage: params.stage,
      payload,
      status: "pending",
    })),
  );
  if (error) throw new Error(`Failed to enqueue "${params.stage}" jobs: ${error.message}`);
}

/** Claims up to `limit` pending jobs for a stage via FOR UPDATE SKIP LOCKED (see migration 0011). */
export async function claimJobs(
  db: SupabaseClient,
  params: { ownerId: string; stage: string; limit: number },
): Promise<JobRow[]> {
  await reclaimStuckJobs(db, params.ownerId, params.stage);
  const { data, error } = await db.rpc("claim_jobs", {
    p_owner_id: params.ownerId,
    p_stage: params.stage,
    p_limit: params.limit,
  });
  if (error) throw new Error(`Failed to claim "${params.stage}" jobs: ${error.message}`);
  return (data ?? []) as JobRow[];
}

export async function completeJob(db: SupabaseClient, jobId: string): Promise<void> {
  await db.from("jobs").update({ status: "done" }).eq("id", jobId);
}

/** Retries up to MAX_ATTEMPTS (back to "pending"), then leaves it "failed". */
export async function failJob(
  db: SupabaseClient,
  job: JobRow,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const status = job.attempts < MAX_ATTEMPTS ? "pending" : "failed";
  await db.from("jobs").update({ status, error: message }).eq("id", job.id);
}
