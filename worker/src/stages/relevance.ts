import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildRelevancePrompt, callLlm, relevanceSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { cosineSimilarity } from "../lib/dedup.js";

const PAGE_SIZE = 1000;

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
    items.push(...((data ?? []) as ItemRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  let scoredPairs = 0;
  let archived = 0;

  for (const item of items) {
    if (!item.embedding) continue;
    let clearedAnyThreshold = false;

    for (const topic of topics as TopicRow[]) {
      if (!topic.embedding) continue;
      const cosine = cosineSimilarity(item.embedding, topic.embedding);
      if (cosine < limits.thresholds.relevance_prefilter_cosine) continue;

      try {
        const result = await callLlm({
          role: "fast",
          promptName: "relevance",
          prompt: buildRelevancePrompt({
            itemTitle: item.title,
            itemStandfirst: item.standfirst,
            itemLanguage: item.language,
            topicName: topic.name,
            topicDescription: topic.description,
            topicExclusions: topic.exclusions ?? [],
          }),
          schema: relevanceSchema,
          modelsConfig: models,
          apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
          db,
          ownerId: env.OWNER_ID,
          runId: run.id,
          stage: "relevance",
          maxTokens: 256,
        });

        await db.from("item_topic_scores").upsert(
          {
            owner_id: env.OWNER_ID,
            item_id: item.id,
            topic_id: topic.id,
            score: result.score,
            reason: result.reason,
            model: models.roles.fast.model,
          },
          { onConflict: "item_id,topic_id" },
        );
        scoredPairs++;
        if (result.score >= topic.relevance_threshold) clearedAnyThreshold = true;
      } catch (err) {
        console.error(`relevance: failed scoring item ${item.id} against topic ${topic.id}: ${(err as Error).message}`);
      }
    }

    const newStatus = clearedAnyThreshold ? "scored" : "not_relevant";
    if (newStatus === "not_relevant") archived++;
    await db.from("items").update({ status: newStatus }).eq("id", item.id);
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "ok",
      stats: { stage: "relevance", date, itemsChecked: items.length, scoredPairs, archived },
    })
    .eq("id", run.id);

  console.log(`relevance stage done: ${scoredPairs} item/topic pairs scored, ${archived} items archived as not_relevant`);
}
