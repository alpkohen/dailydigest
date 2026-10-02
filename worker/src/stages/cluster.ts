import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildSameStoryPrompt, callLlm, sameStorySchema } from "@dailydigest/llm";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";
import { decideCluster, updateCentroid, type StoryCandidate } from "../lib/cluster.js";
import { parseEmbedding } from "../lib/vector.js";

const WINDOW_MS = 72 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

interface ItemRow {
  id: string;
  title: string;
  standfirst: string | null;
  published_at: string | null;
  created_at: string;
  embedding: number[] | null;
}

interface MutableStory extends StoryCandidate {
  itemCount: number;
}

async function fetchSampleTitles(db: SupabaseClient, storyId: string): Promise<string[]> {
  const { data } = await db
    .from("story_items")
    .select("items(title)")
    .eq("story_id", storyId)
    .limit(3);
  return ((data ?? []) as unknown as { items: { title: string } | null }[])
    .map((row) => row.items?.title)
    .filter((t): t is string => Boolean(t));
}

async function linkStoryTopics(db: SupabaseClient, ownerId: string, storyId: string, itemId: string): Promise<void> {
  const { data: scores } = await db
    .from("item_topic_scores")
    .select("topic_id, score, topics(relevance_threshold)")
    .eq("item_id", itemId);
  for (const row of (scores ?? []) as unknown as { topic_id: string; score: number; topics: { relevance_threshold: number } | null }[]) {
    const threshold = row.topics?.relevance_threshold;
    if (threshold != null && row.score >= threshold) {
      await db
        .from("story_topics")
        .upsert(
          { owner_id: ownerId, story_id: storyId, topic_id: row.topic_id },
          { onConflict: "story_id,topic_id" },
        );
    }
  }
}

/**
 * SPEC.md section 6, stage 6 "Cluster": incremental, cross-lingual (the
 * embedding model is multilingual per CLAUDE.md rule) clustering of
 * relevant items into stories, comparing against candidate stories from
 * the last 72h by centroid similarity.
 */
export async function runClusterStage(env: Env, models: ModelsConfig, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "cluster", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: storyRows, error: storyError } = await db
    .from("stories")
    .select("id, centroid, last_updated_at, story_items(count)")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "open")
    .gte("last_updated_at", new Date(Date.now() - WINDOW_MS - 24 * 60 * 60 * 1000).toISOString());
  if (storyError) throw new Error(`Failed to load stories: ${storyError.message}`);

  const stories: MutableStory[] = ((storyRows ?? []) as {
    id: string;
    centroid: number[];
    last_updated_at: string;
    story_items: { count: number }[];
  }[]).map((row) => ({
    id: row.id,
    centroid: parseEmbedding(row.centroid) ?? [],
    lastUpdatedAt: Date.parse(row.last_updated_at),
    itemCount: row.story_items?.[0]?.count ?? 1,
  }));

  const items: ItemRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id, title, standfirst, published_at, created_at, embedding")
      .eq("owner_id", env.OWNER_ID)
      .eq("status", "scored")
      .is("canonical_item_id", null)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load scored items: ${error.message}`);
    items.push(...((data ?? []) as ItemRow[]).map((row) => ({ ...row, embedding: parseEmbedding(row.embedding) })));
    if (!data || data.length < PAGE_SIZE) break;
  }
  items.sort((a, b) => Date.parse(a.published_at ?? a.created_at) - Date.parse(b.published_at ?? b.created_at));

  let attached = 0;
  let confirmed = 0;
  let newStories = 0;

  for (const item of items) {
    if (!item.embedding) continue;
    const publishedAt = Date.parse(item.published_at ?? item.created_at);

    let decision = decideCluster(item.embedding, publishedAt, stories, WINDOW_MS, limits.thresholds.cluster_high, limits.thresholds.cluster_low);

    if (decision.action === "confirm") {
      const sampleTitles = await fetchSampleTitles(db, decision.storyId);
      try {
        const result = await callLlm({
          role: "mid",
          promptName: "same_story",
          prompt: buildSameStoryPrompt({
            storyTitle: sampleTitles[0] ?? "(story)",
            sampleItemTitles: sampleTitles,
            candidateTitle: item.title,
            candidateStandfirst: item.standfirst,
          }),
          schema: sameStorySchema,
          modelsConfig: models,
          apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
          db,
          ownerId: env.OWNER_ID,
          runId: run.id,
          stage: "cluster",
          maxTokens: 128,
        });
        decision = result.same
          ? { action: "attach", storyId: decision.storyId, cosine: decision.cosine }
          : { action: "new" };
        confirmed++;
      } catch (err) {
        console.error(`cluster: same_story confirmation failed for item ${item.id}: ${(err as Error).message}`);
        decision = { action: "new" };
      }
    }

    if (decision.action === "attach") {
      const story = stories.find((s) => s.id === decision.storyId)!;
      const newCentroid = updateCentroid(story.centroid, story.itemCount, item.embedding);

      await db.from("story_items").upsert(
        { owner_id: env.OWNER_ID, story_id: story.id, item_id: item.id },
        { onConflict: "story_id,item_id" },
      );
      await db
        .from("stories")
        .update({ centroid: newCentroid, last_updated_at: new Date(Math.max(story.lastUpdatedAt, publishedAt)).toISOString() })
        .eq("id", story.id);

      story.centroid = newCentroid;
      story.itemCount += 1;
      story.lastUpdatedAt = Math.max(story.lastUpdatedAt, publishedAt);
      await linkStoryTopics(db, env.OWNER_ID, story.id, item.id);
      attached++;
    } else {
      const { data: newStory, error } = await db
        .from("stories")
        .insert({
          owner_id: env.OWNER_ID,
          title: item.title,
          novelty: "new",
          centroid: item.embedding,
          first_seen_at: item.published_at ?? item.created_at,
          last_updated_at: item.published_at ?? item.created_at,
          status: "open",
        })
        .select("id")
        .single();
      if (error || !newStory) {
        console.error(`cluster: failed to create story for item ${item.id}: ${error?.message}`);
        continue;
      }
      await db.from("story_items").insert({ owner_id: env.OWNER_ID, story_id: newStory.id, item_id: item.id });
      stories.push({ id: newStory.id, centroid: item.embedding, lastUpdatedAt: publishedAt, itemCount: 1 });
      await linkStoryTopics(db, env.OWNER_ID, newStory.id, item.id);
      newStories++;
    }
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "ok",
      stats: { stage: "cluster", date, itemsProcessed: items.length, attached, confirmed, newStories },
    })
    .eq("id", run.id);

  console.log(
    `cluster stage done: ${items.length} items processed, ${attached} attached, ${confirmed} needed LLM confirmation, ${newStories} new stories`,
  );
}
