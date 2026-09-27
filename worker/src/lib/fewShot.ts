import type { SupabaseClient } from "@supabase/supabase-js";

const POSITIVE_SIGNALS = ["relevant", "saved"];
const NEGATIVE_SIGNALS = ["not_relevant", "less_like_this"];
const MAX_EXAMPLES = 20;

async function fetchItemTitlesForFeedback(
  db: SupabaseClient,
  ownerId: string,
  topicId: string,
  signals: string[],
): Promise<string[]> {
  const { data: feedbackRows } = await db
    .from("feedback")
    .select("target_id, created_at")
    .eq("owner_id", ownerId)
    .eq("target_type", "story")
    .in("signal", signals)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!feedbackRows || feedbackRows.length === 0) return [];

  const storyIds = feedbackRows.map((r) => r.target_id);
  const { data: topicLinks } = await db
    .from("story_topics")
    .select("story_id")
    .eq("topic_id", topicId)
    .in("story_id", storyIds);
  const relevantStoryIds = new Set((topicLinks ?? []).map((r) => r.story_id));
  if (relevantStoryIds.size === 0) return [];

  const orderedStoryIds = storyIds.filter((id) => relevantStoryIds.has(id)).slice(0, MAX_EXAMPLES);
  if (orderedStoryIds.length === 0) return [];

  const { data: storyItems } = await db
    .from("story_items")
    .select("story_id, items(title)")
    .in("story_id", orderedStoryIds);

  const titleByStory = new Map<string, string>();
  for (const row of (storyItems ?? []) as unknown as { story_id: string; items: { title: string } | null }[]) {
    if (row.items?.title && !titleByStory.has(row.story_id)) titleByStory.set(row.story_id, row.items.title);
  }
  return orderedStoryIds.map((id) => titleByStory.get(id)).filter((t): t is string => Boolean(t));
}

/**
 * SPEC.md section 4.14: "Per topic, the most recent 20 positive and 20
 * negative items are injected as few-shot examples into the relevance
 * prompt." Feedback is captured at story level (the UI/email granularity),
 * so this resolves each story back to one of its source item titles.
 */
export async function fetchFewShotExamples(
  db: SupabaseClient,
  ownerId: string,
  topicId: string,
): Promise<{ positive: string[]; negative: string[] }> {
  const [positive, negative] = await Promise.all([
    fetchItemTitlesForFeedback(db, ownerId, topicId, POSITIVE_SIGNALS),
    fetchItemTitlesForFeedback(db, ownerId, topicId, NEGATIVE_SIGNALS),
  ]);
  return { positive, negative };
}
