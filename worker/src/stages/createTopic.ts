import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildTopicDraftPrompt, callLlm, embedTexts, topicDraftSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";

/**
 * SPEC.md section 4.1: "Create a topic by typing one sentence. The system
 * drafts: a description, Turkish and English search queries, suggested
 * sources, exclusion terms." The full edit-and-save UI is M5 (Core app);
 * this CLI path inserts the draft directly so the pipeline has real topics
 * to score against before the app exists. The owner can edit rows in
 * Supabase (or the app, once M5 lands) afterwards.
 */
export async function runCreateTopicStage(
  env: Env,
  models: ModelsConfig,
  limits: LimitsConfig,
  sentence: string,
): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const draft = await callLlm({
    role: "strong",
    promptName: "topic_draft",
    prompt: buildTopicDraftPrompt(sentence),
    schema: topicDraftSchema,
    modelsConfig: models,
    apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
    db,
    ownerId: env.OWNER_ID,
    stage: "create_topic",
    maxTokens: 1024,
  });

  const [embedding] = await embedTexts({
    texts: [`${draft.name}\n\n${draft.description}`],
    embedding: models.embedding,
    prices: models.prices_per_million_tokens,
    apiKeys: { openai: env.OPENAI_API_KEY },
    db,
    ownerId: env.OWNER_ID,
    stage: "create_topic",
  });

  const { data, error } = await db
    .from("topics")
    .insert({
      owner_id: env.OWNER_ID,
      name: draft.name,
      description: draft.description,
      queries_tr: draft.queries_tr,
      queries_en: draft.queries_en,
      exclusions: draft.exclusions,
      priority: "normal",
      frequency: "daily",
      alerts_enabled: false,
      languages: ["tr", "en"],
      active: true,
      embedding,
      relevance_threshold: limits.thresholds.relevance_default,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to insert topic: ${error?.message}`);

  console.log(`Created topic "${draft.name}" (${data.id})`);
  console.log(`  description: ${draft.description}`);
  console.log(`  queries_tr: ${draft.queries_tr.join(" | ")}`);
  console.log(`  queries_en: ${draft.queries_en.join(" | ")}`);
  console.log(`  exclusions: ${draft.exclusions.join(", ") || "(none)"}`);
  console.log(`  suggested_sources: ${draft.suggested_sources.join(", ") || "(none)"}`);
}
