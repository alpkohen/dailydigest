import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import {
  buildTopicKeywordsPrompt,
  buildTopicMatchPrompt,
  callLlm,
  topicKeywordsSchema,
  topicMatchSchema,
} from "@dailydigest/llm";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";
import { compileKeywords, matchesKeywords, type CompiledKeywords } from "../lib/keywordMatch.js";

// Only fresh items are matched; anything older the previous pipeline left
// behind was moved to 'not_relevant' by migration 0025 and stays searchable.
const MATCH_WINDOW_DAYS = 3;
const PAGE_SIZE = 1000;
const KEYWORD_SCORE = 10;
const AI_SCORE = 7;

interface TopicRow {
  id: string;
  name: string;
  description: string | null;
  queries_tr: string[];
  queries_en: string[];
  exclusions: string[];
  keywords: string[];
  keywords_generated_at: string | null;
  backfilled_at: string | null;
}

interface ItemRow {
  id: string;
  title: string;
  standfirst: string | null;
}

interface PreparedTopic extends TopicRow {
  compiled: CompiledKeywords;
}

interface MatchContext {
  env: Env;
  models: ModelsConfig;
  db: SupabaseClient;
  runId: string;
}

async function ensureKeywords(ctx: MatchContext, topic: TopicRow): Promise<TopicRow> {
  if (topic.keywords_generated_at && topic.keywords.length > 0) return topic;
  try {
    const result = await callLlm({
      role: "fast",
      promptName: "topic_keywords",
      prompt: buildTopicKeywordsPrompt({
        name: topic.name,
        description: topic.description,
        queries: [...topic.queries_tr, ...topic.queries_en],
      }),
      schema: topicKeywordsSchema,
      modelsConfig: ctx.models,
      apiKeys: { anthropic: ctx.env.ANTHROPIC_API_KEY, openai: ctx.env.OPENAI_API_KEY },
      db: ctx.db,
      ownerId: ctx.env.OWNER_ID,
      runId: ctx.runId,
      stage: "match",
      maxTokens: 800,
    });
    const keywords = [...new Set([topic.name, ...result.keywords].map((k) => k.trim()).filter(Boolean))];
    await ctx.db
      .from("topics")
      .update({ keywords, keywords_generated_at: new Date().toISOString() })
      .eq("id", topic.id);
    return { ...topic, keywords };
  } catch (err) {
    // Without generated keywords the topic name alone still matches, and
    // the AI half still runs; the next run retries generation.
    console.error(`match: keyword generation for "${topic.name}" failed: ${(err as Error).message}`);
    return { ...topic, keywords: topic.keywords.length ? topic.keywords : [topic.name] };
  }
}

/**
 * Matches one batch of items against the given topics: keyword OR AI.
 * Returns item id -> matched topic ids, plus whether the AI half succeeded
 * (when it didn't, unmatched items must stay pending for a retry rather than
 * be written off as unrelated).
 */
async function matchBatch(
  ctx: MatchContext,
  topics: PreparedTopic[],
  items: ItemRow[],
): Promise<{ matches: Map<string, Map<string, number>>; aiOk: boolean }> {
  const matches = new Map<string, Map<string, number>>();
  const add = (itemId: string, topicId: string, score: number) => {
    const byTopic = matches.get(itemId) ?? new Map<string, number>();
    byTopic.set(topicId, Math.max(byTopic.get(topicId) ?? 0, score));
    matches.set(itemId, byTopic);
  };

  for (const item of items) {
    const text = `${item.title} ${item.standfirst ?? ""}`;
    for (const topic of topics) {
      if (matchesKeywords(topic.compiled, text)) add(item.id, topic.id, KEYWORD_SCORE);
    }
  }

  let aiOk = true;
  try {
    const result = await callLlm({
      role: "fast",
      promptName: "topic_match",
      prompt: buildTopicMatchPrompt({
        topics: topics.map((t, index) => ({ index, name: t.name, description: t.description })),
        items: items.map((i, index) => ({ index, title: i.title, standfirst: i.standfirst })),
      }),
      schema: topicMatchSchema,
      modelsConfig: ctx.models,
      apiKeys: { anthropic: ctx.env.ANTHROPIC_API_KEY, openai: ctx.env.OPENAI_API_KEY },
      db: ctx.db,
      ownerId: ctx.env.OWNER_ID,
      runId: ctx.runId,
      stage: "match",
      maxTokens: 2000,
    });
    for (const m of result.matches) {
      const item = items[m.i];
      if (!item) continue;
      for (const t of m.t) {
        const topic = topics[t];
        if (topic) add(item.id, topic.id, AI_SCORE);
      }
    }
  } catch (err) {
    aiOk = false;
    console.error(`match: AI batch failed, keyword matches kept, rest retried next run: ${(err as Error).message}`);
  }

  return { matches, aiOk };
}

async function writeScores(ctx: MatchContext, matches: Map<string, Map<string, number>>): Promise<void> {
  const rows = [...matches.entries()].flatMap(([itemId, byTopic]) =>
    [...byTopic.entries()].map(([topicId, score]) => ({
      owner_id: ctx.env.OWNER_ID,
      item_id: itemId,
      topic_id: topicId,
      score,
      reason: score === KEYWORD_SCORE ? "keyword" : "ai",
    })),
  );
  if (rows.length === 0) return;
  const { error } = await ctx.db.from("item_topic_scores").upsert(rows, { onConflict: "item_id,topic_id" });
  if (error) throw new Error(`Failed to write item_topic_scores: ${error.message}`);
}

async function setStatus(db: SupabaseClient, ids: string[], status: string): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("items").update({ status }).in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`Failed to set items to ${status}: ${error.message}`);
  }
}

async function loadItems(db: SupabaseClient, ownerId: string, statuses: string[], sinceDays: number): Promise<ItemRow[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const all: ItemRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id, title, standfirst")
      .eq("owner_id", ownerId)
      .in("status", statuses)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load items: ${error.message}`);
    all.push(...((data ?? []) as ItemRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * A topic created after its articles were already ingested is matched
 * against the last few days of stored items, so a new topic starts with
 * recent coverage instead of an empty page. Newly matched items that were
 * written off as unrelated go back to 'scored' for grouping; ones already
 * grouped under another topic get this topic added to their story.
 */
async function backfillTopic(ctx: MatchContext, topic: PreparedTopic, limits: LimitsConfig): Promise<void> {
  const items = await loadItems(ctx.db, ctx.env.OWNER_ID, ["not_relevant", "scored", "grouped"], limits.pipeline.topic_backfill_days);
  let matched = 0;
  for (let i = 0; i < items.length; i += limits.pipeline.match_batch_size) {
    const batch = items.slice(i, i + limits.pipeline.match_batch_size);
    const { matches } = await matchBatch(ctx, [topic], batch);
    await writeScores(ctx, matches);
    const ids = [...matches.keys()];
    matched += ids.length;
    if (ids.length === 0) continue;

    await ctx.db.from("items").update({ status: "scored" }).in("id", ids).eq("status", "not_relevant");
    const { data: links } = await ctx.db.from("story_items").select("story_id").in("item_id", ids);
    const storyIds = [...new Set((links ?? []).map((l) => l.story_id as string))];
    if (storyIds.length > 0) {
      await ctx.db
        .from("story_topics")
        .upsert(
          storyIds.map((storyId) => ({ owner_id: ctx.env.OWNER_ID, story_id: storyId, topic_id: topic.id })),
          { onConflict: "story_id,topic_id" },
        );
    }
  }
  await ctx.db.from("topics").update({ backfilled_at: new Date().toISOString() }).eq("id", topic.id);
  console.log(`match: backfilled "${topic.name}" over ${items.length} items, ${matched} matched`);
}

/**
 * Match: assign every new item to the topics it is about, by keyword OR a
 * batched AI call (either one is enough). Matched items become 'scored' and
 * go on to grouping; the rest become 'not_relevant' but are never deleted
 * early and stay searchable.
 */
export async function runMatchStage(env: Env, models: ModelsConfig, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "match", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);
  const ctx: MatchContext = { env, models, db, runId: run.id };

  const { data: topicRows, error: topicsError } = await db
    .from("topics")
    .select("id, name, description, queries_tr, queries_en, exclusions, keywords, keywords_generated_at, backfilled_at")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);
  if (topicsError) throw new Error(`Failed to load topics: ${topicsError.message}`);

  const topics: PreparedTopic[] = [];
  for (const row of (topicRows ?? []) as TopicRow[]) {
    const withKeywords = await ensureKeywords(ctx, row);
    topics.push({ ...withKeywords, compiled: compileKeywords(withKeywords.keywords, withKeywords.exclusions) });
  }

  if (topics.length === 0) {
    console.log("match: no active topics, nothing to match");
    await db.from("pipeline_runs").update({ finished_at: new Date().toISOString(), status: "ok" }).eq("id", run.id);
    return;
  }

  for (const topic of topics.filter((t) => !t.backfilled_at)) {
    await backfillTopic(ctx, topic, limits);
  }

  const items = await loadItems(db, env.OWNER_ID, ["new"], MATCH_WINDOW_DAYS);
  let matchedCount = 0;
  let unmatchedCount = 0;
  let retriedCount = 0;

  for (let i = 0; i < items.length; i += limits.pipeline.match_batch_size) {
    const batch = items.slice(i, i + limits.pipeline.match_batch_size);
    const { matches, aiOk } = await matchBatch(ctx, topics, batch);
    await writeScores(ctx, matches);

    const matchedIds = batch.filter((item) => matches.has(item.id)).map((item) => item.id);
    const unmatchedIds = batch.filter((item) => !matches.has(item.id)).map((item) => item.id);
    await setStatus(db, matchedIds, "scored");
    matchedCount += matchedIds.length;
    if (aiOk) {
      await setStatus(db, unmatchedIds, "not_relevant");
      unmatchedCount += unmatchedIds.length;
    } else {
      retriedCount += unmatchedIds.length;
    }
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: retriedCount > 0 ? "partial" : "ok",
      stats: { stage: "match", date, items: items.length, matched: matchedCount, unmatched: unmatchedCount, leftForRetry: retriedCount },
    })
    .eq("id", run.id);

  console.log(`match stage done: ${items.length} items, ${matchedCount} matched, ${unmatchedCount} unmatched, ${retriedCount} left for retry`);
}
