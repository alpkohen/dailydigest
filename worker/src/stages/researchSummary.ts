import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildResearchSummaryPrompt, callLlm, researchSummarySchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { runPool } from "../lib/pool.js";

const CONCURRENCY = 10;

/**
 * SPEC.md section 6, stage 9 "Research layer": OpenAlex results scored and
 * summarised separately since academic items rarely cluster with news.
 */
export async function runResearchSummaryStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "research_summary", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: rows, error } = await db
    .from("research_items")
    .select("id, journal, items(title, standfirst)")
    .eq("owner_id", env.OWNER_ID)
    .is("argument", null);
  if (error) throw new Error(`Failed to load research_items: ${error.message}`);

  let summarised = 0;

  await runPool(
    (rows ?? []) as unknown as { id: string; journal: string | null; items: { title: string; standfirst: string | null } | null }[],
    CONCURRENCY,
    async (row) => {
      const item = row.items;
      if (!item) return;
      try {
        const result = await callLlm({
          role: "fast",
          promptName: "research_summary",
          prompt: buildResearchSummaryPrompt({ title: item.title, journal: row.journal, abstract: item.standfirst }),
          schema: researchSummarySchema,
          modelsConfig: models,
          apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
          db,
          ownerId: env.OWNER_ID,
          runId: run.id,
          stage: "research_summary",
          maxTokens: 512,
        });
        await db
          .from("research_items")
          .update({ argument: result.argument, method: result.method, relevance: result.relevance })
          .eq("id", row.id);
        summarised++;
      } catch (err) {
        console.error(`research_summary: failed for research_item ${row.id}: ${(err as Error).message}`);
      }
    },
  );

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "research_summary", date, summarised } })
    .eq("id", run.id);

  console.log(`research_summary stage done: ${summarised} research items summarised`);
}
