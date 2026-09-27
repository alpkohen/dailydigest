import type { SupabaseClient } from "@supabase/supabase-js";

const POSITIVE_SIGNALS = ["relevant", "saved"];
const NEGATIVE_SIGNALS = ["not_relevant", "less_like_this"];
// SPEC.md section 4.14: "a topic falling below 50 percent precision
// triggers a suggestion to refine its description." A small sample makes
// that swing wildly, so it only fires with at least this many signals.
export const PRECISION_SUGGESTION_THRESHOLD = 0.5;
const MIN_SAMPLE_SIZE = 5;

export interface TopicPrecision {
  precision: number | null;
  sampleSize: number;
}

/** SPEC.md section 4.1: "precision stats (what share of surfaced items were marked relevant)." */
export async function computeTopicPrecision(supabase: SupabaseClient, topicId: string): Promise<TopicPrecision> {
  const { data: storyTopics } = await supabase.from("story_topics").select("story_id").eq("topic_id", topicId);
  const storyIds = (storyTopics ?? []).map((r) => r.story_id);
  if (storyIds.length === 0) return { precision: null, sampleSize: 0 };

  const { data: feedbackRows } = await supabase
    .from("feedback")
    .select("signal")
    .eq("target_type", "story")
    .in("target_id", storyIds)
    .in("signal", [...POSITIVE_SIGNALS, ...NEGATIVE_SIGNALS]);

  const positive = (feedbackRows ?? []).filter((r) => POSITIVE_SIGNALS.includes(r.signal)).length;
  const total = feedbackRows?.length ?? 0;
  if (total < MIN_SAMPLE_SIZE) return { precision: null, sampleSize: total };

  return { precision: positive / total, sampleSize: total };
}
