import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { callLlm } from "@dailydigest/llm";
import { z } from "zod";
import type { Env } from "../env.js";

const pingResponseSchema = z.object({ ok: z.literal(true) });

/**
 * A no-op stage that exercises the M0 plumbing end to end: the jobs queue
 * pattern (enqueue, claim with FOR UPDATE SKIP LOCKED, mark done), the
 * pipeline_runs record, and one real call through packages/llm so a row
 * lands in llm_calls with tokens and cost. No real ingestion or scoring
 * happens here — that starts in M1.
 */
export async function runPingStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "ping", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: job, error: jobError } = await db
    .from("jobs")
    .insert({
      owner_id: env.OWNER_ID,
      run_id: run.id,
      stage: "ping",
      payload: { date },
      status: "pending",
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`Failed to enqueue ping job: ${jobError?.message}`);

  const { data: claimed, error: claimError } = await db
    .from("jobs")
    .update({ status: "claimed", locked_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id")
    .single();
  if (claimError || !claimed) throw new Error(`Failed to claim ping job: ${claimError?.message}`);

  const result = await callLlm({
    role: "fast",
    promptName: "ping",
    system: "Respond with strictly valid JSON matching {\"ok\": true} and nothing else.",
    prompt: "Reply now.",
    schema: pingResponseSchema,
    modelsConfig: models,
    apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
    db,
    ownerId: env.OWNER_ID,
    runId: run.id,
    stage: "ping",
  });

  await db.from("jobs").update({ status: "done" }).eq("id", job.id);
  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok" })
    .eq("id", run.id);

  console.log(`ping stage ok: llm responded ${JSON.stringify(result)}`);
}
