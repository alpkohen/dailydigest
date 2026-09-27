import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { embedTexts } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { claimJobs, completeJob, enqueueJobs, failJob, type JobRow } from "../jobs.js";

const CLAIM_BATCH_SIZE = 3;
const ITEMS_PER_JOB = 50;
const EMBED_WORD_LIMIT = 500;
// Hard safety net on top of the word cap: OpenAI's embedding endpoint caps
// input at 8192 tokens, and some extracted pages (live blogs, malformed
// whitespace) can blow past 500 "words" worth of tokens. ~4 chars/token is
// a conservative estimate, so this stays well under the limit.
const EMBED_CHAR_LIMIT = 20_000;

export function embeddingInput(title: string, text: string | null): string {
  if (!text) return title.slice(0, EMBED_CHAR_LIMIT);
  const words = text.trim().split(/\s+/).slice(0, EMBED_WORD_LIMIT).join(" ");
  return `${title}\n\n${words}`.slice(0, EMBED_CHAR_LIMIT);
}

/**
 * Multilingual embedding of title plus first ~500 words (SPEC.md section 6,
 * stage 3 "Embed"). Runs for every canonical item, per CLAUDE.md rule 5:
 * "Store embeddings for every item from day one."
 */
export async function runEmbedStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "embed", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const itemIds: string[] = [];
  const PAGE_SIZE = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id")
      .eq("owner_id", env.OWNER_ID)
      .eq("status", "extracted")
      .is("canonical_item_id", null)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load extracted items: ${error.message}`);
    itemIds.push(...(data ?? []).map((r) => r.id));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const batches: string[][] = [];
  for (let i = 0; i < itemIds.length; i += ITEMS_PER_JOB) {
    batches.push(itemIds.slice(i, i + ITEMS_PER_JOB));
  }
  await enqueueJobs(db, {
    ownerId: env.OWNER_ID,
    runId: run.id,
    stage: "embed",
    payloads: batches.map((ids) => ({ itemIds: ids })),
  });

  let processed = 0;
  let failed = 0;

  while (true) {
    const jobs: JobRow[] = await claimJobs(db, { ownerId: env.OWNER_ID, stage: "embed", limit: CLAIM_BATCH_SIZE });
    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        const ids = (job.payload as { itemIds: string[] }).itemIds ?? [];
        const { data: items, error } = await db
          .from("items")
          .select("id, title, text")
          .eq("owner_id", env.OWNER_ID)
          .in("id", ids);
        if (error) throw new Error(error.message);
        if (!items || items.length === 0) {
          await completeJob(db, job.id);
          continue;
        }

        const vectors = await embedTexts({
          texts: items.map((item) => embeddingInput(item.title, item.text)),
          embedding: models.embedding,
          prices: models.prices_per_million_tokens,
          apiKeys: { openai: env.OPENAI_API_KEY },
          db,
          ownerId: env.OWNER_ID,
          runId: run.id,
          stage: "embed",
        });

        for (let i = 0; i < items.length; i++) {
          await db
            .from("items")
            .update({
              embedding: vectors[i],
              embedding_model: models.embedding.model,
              status: "embedded",
            })
            .eq("id", items[i]!.id);
        }

        await completeJob(db, job.id);
        processed++;
      } catch (err) {
        console.error(`embed job ${job.id} failed:`, (err as Error).message);
        await failJob(db, job, err);
        failed++;
      }
    }
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "ok",
      stats: { stage: "embed", date, processed, failed },
    })
    .eq("id", run.id);

  console.log(`embed stage done: ${processed} batches processed, ${failed} failed`);
}
