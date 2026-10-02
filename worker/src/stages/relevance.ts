import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildRelevanceBatchPrompt, callLlm, relevanceBatchSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { cosineSimilarity } from "../lib/dedup.js";
import { parseEmbedding } from "../lib/vector.js";
import { fetchFewShotExamples } from "../lib/fewShot.js";
import { runPool } from "../lib/pool.js";

const PAGE_SIZE = 1000;
// Was 15 - the highest of any stage, and a full-system audit found this
// stage failing ~39% of its LLM calls over 30 days (2929/7575), almost
// certainly this pool outrunning the fast-role model's rate limit and the
// one immediate retry landing on the same limit. Matched to the other
// per-item LLM stages (enrich, questionEvidence) instead of standing out.
// Now bounds concurrent *batches* rather than concurrent items, so the
// effective items-in-flight is roughly CONCURRENCY * BATCH_SIZE - kept at
// the same value since it was tuned against this model's actual rate
// limit, not against item count.
const CONCURRENCY = 8;
// One call now scores a whole batch against one topic instead of one
// item/topic pair, so topic context (description, exclusions, few-shot
// examples) is sent once per batch instead of once per item - fewer,
// larger calls instead of many small ones. Relevance was observed live
// taking 45-60 minutes/day at one call per item/topic pair (9737 pairs on
// 2026-09-30); this cuts call count roughly BATCH_SIZE-fold for the same
// work. Kept modest: a bigger batch risks the model's per-item attention
// degrading, and one bad/truncated response now costs a whole batch's
// worth of retries instead of one item's.
const BATCH_SIZE = 10;

interface TopicRow {
  id: string;
  name: string;
  description: string | null;
  exclusions: string[];
  embedding: number[] | null;
  relevance_threshold: number;
}

interface ItemRow {
  id: string;
  title: string;
  standfirst: string | null;
  language: string | null;
  embedding: number[] | null;
}

export type RelevanceOutcome = "scored" | "not_relevant" | "retry";

/**
 * A failed LLM call must never be mistaken for "scored below threshold" -
 * that misclassified real items as not_relevant purely because a call
 * failed (found in a full-system audit, 2026-09-28). "retry" means: leave
 * the item's status unchanged so the next relevance run picks it back up.
 */
export function resolveRelevanceOutcome(clearedAnyThreshold: boolean, hadFailure: boolean): RelevanceOutcome {
  if (clearedAnyThreshold) return "scored";
  if (hadFailure) return "retry";
  return "not_relevant";
}

/**
 * SPEC.md section 6, stage 5 "Relevance": cheap model scores each canonical
 * item against each active topic whose embedding pre-filter passes. Items
 * that clear no topic's threshold are archived as not_relevant (still
 * searchable, never deleted).
 */
export async function runRelevanceStage(env: Env, models: ModelsConfig, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "relevance", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: topics, error: topicsError } = await db
    .from("topics")
    .select("id, name, description, exclusions, embedding, relevance_threshold")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);
  if (topicsError) throw new Error(`Failed to load topics: ${topicsError.message}`);

  if (!topics || topics.length === 0) {
    console.log("relevance stage: no active topics yet, nothing to score (items left as-is)");
    await db
      .from("pipeline_runs")
      .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "relevance", date, scored: 0, archived: 0 } })
      .eq("id", run.id);
    return;
  }

  const topicRows: TopicRow[] = (topics as TopicRow[]).map((topic) => ({ ...topic, embedding: parseEmbedding(topic.embedding) }));

  const items: ItemRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id, title, standfirst, language, embedding")
      .eq("owner_id", env.OWNER_ID)
      .eq("status", "embedded")
      .is("canonical_item_id", null)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load embedded items: ${error.message}`);
    items.push(...((data ?? []) as ItemRow[]).map((row) => ({ ...row, embedding: parseEmbedding(row.embedding) })));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const fewShotByTopic = new Map<string, { positive: string[]; negative: string[] }>();
  for (const topic of topicRows) {
    fewShotByTopic.set(topic.id, await fetchFewShotExamples(db, env.OWNER_ID, topic.id));
  }

  let scoredPairs = 0;
  let archived = 0;
  let leftForRetry = 0;

  // Per-item outcome, aggregated across every topic batch it appeared in
  // (an item can clear the cosine prefilter for more than one topic).
  // A full-system audit found items being marked not_relevant (silently
  // dropped from briefs) purely because their LLM call failed, not because
  // they scored below threshold - the two were indistinguishable from
  // clearedAnyThreshold alone. Track failures separately so a failed call
  // defers the item instead of misclassifying it.
  const outcomes = new Map<string, { clearedAnyThreshold: boolean; hadFailure: boolean }>();
  function markOutcome(itemId: string, cleared: boolean, failed: boolean): void {
    const prev = outcomes.get(itemId) ?? { clearedAnyThreshold: false, hadFailure: false };
    outcomes.set(itemId, { clearedAnyThreshold: prev.clearedAnyThreshold || cleared, hadFailure: prev.hadFailure || failed });
  }

  interface BatchTask {
    topic: TopicRow;
    batch: ItemRow[];
  }
  const tasks: BatchTask[] = [];
  for (const topic of topicRows) {
    if (!topic.embedding) continue;
    const candidates = items.filter(
      (item) => item.embedding && cosineSimilarity(item.embedding, topic.embedding!) >= limits.thresholds.relevance_prefilter_cosine,
    );
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      tasks.push({ topic, batch: candidates.slice(i, i + BATCH_SIZE) });
    }
  }

  await runPool(tasks, CONCURRENCY, async ({ topic, batch }) => {
    try {
      const result = await callLlm({
        role: "fast",
        promptName: "relevance_batch",
        prompt: buildRelevanceBatchPrompt({
          items: batch.map((item) => ({ id: item.id, title: item.title, standfirst: item.standfirst, language: item.language })),
          topicName: topic.name,
          topicDescription: topic.description,
          topicExclusions: topic.exclusions ?? [],
          positiveExamples: fewShotByTopic.get(topic.id)?.positive,
          negativeExamples: fewShotByTopic.get(topic.id)?.negative,
        }),
        schema: relevanceBatchSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        runId: run.id,
        stage: "relevance",
        // Headroom per item for id + score + one-sentence reason as JSON,
        // plus a fixed buffer for the wrapping object.
        maxTokens: 128 + batch.length * 80,
      });

      const byId = new Map(result.results.map((r) => [r.id, r]));
      const rows: { owner_id: string; item_id: string; topic_id: string; score: number; reason: string; model: string }[] = [];
      for (const item of batch) {
        const scored = byId.get(item.id);
        if (!scored) {
          // The model dropped this id from its response - treat like a
          // failed call (defer to retry), never silently archive it.
          markOutcome(item.id, false, true);
          continue;
        }
        rows.push({
          owner_id: env.OWNER_ID,
          item_id: item.id,
          topic_id: topic.id,
          score: scored.score,
          reason: scored.reason,
          model: models.roles.fast.model,
        });
        scoredPairs++;
        markOutcome(item.id, scored.score >= topic.relevance_threshold, false);
      }
      if (rows.length > 0) await db.from("item_topic_scores").upsert(rows, { onConflict: "item_id,topic_id" });
    } catch (err) {
      console.error(`relevance: failed scoring batch of ${batch.length} items against topic ${topic.id}: ${(err as Error).message}`);
      for (const item of batch) markOutcome(item.id, false, true);
    }
  });

  for (const item of items) {
    const outcome = resolveRelevanceOutcome(outcomes.get(item.id)?.clearedAnyThreshold ?? false, outcomes.get(item.id)?.hadFailure ?? false);
    if (outcome === "retry") {
      // Leave status as "embedded" (unchanged): the next relevance run
      // picks it back up via the same status="embedded" query this stage
      // already uses, so no separate retry path or item status is needed.
      leftForRetry++;
      continue;
    }
    if (outcome === "not_relevant") archived++;
    await db.from("items").update({ status: outcome }).eq("id", item.id);
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: leftForRetry > 0 ? "partial" : "ok",
      stats: { stage: "relevance", date, itemsChecked: items.length, scoredPairs, archived, leftForRetry },
    })
    .eq("id", run.id);

  console.log(
    `relevance stage done: ${scoredPairs} item/topic pairs scored, ${archived} items archived as not_relevant, ${leftForRetry} left for retry after a failed call`,
  );
}
