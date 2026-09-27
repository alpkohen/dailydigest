import { createServiceRoleClient } from "@dailydigest/db";
import type { Env } from "../env.js";

const POSITIVE_SIGNALS = ["relevant", "saved", "more_from_this_source"];
const NEGATIVE_SIGNALS = ["not_relevant", "less_like_this", "mute_source"];
const MAX_STEP = 0.05;
const ADJUSTMENT_PER_NET_SIGNAL = 0.01;

interface SourceRow {
  id: string;
  weight: number;
  weight_locked: boolean;
}

interface FeedbackRow {
  id: string;
  target_id: string;
  signal: string;
}

/**
 * SPEC.md section 4.14: "Source weights drift slowly with feedback
 * (bounded, owner can lock a weight)." Story-level feedback (the app/email
 * granularity) is attributed back to the sources of that story's items;
 * direct source-level feedback (mute_source, more_from_this_source) counts
 * too. Each feedback row is marked applied_to_weight_at once processed, so
 * a single piece of feedback nudges the weight once, not every night
 * forever (the bug this replaced: re-summing all historical feedback on
 * every run drifted weights unboundedly from stale signals).
 */
export async function runLearnStage(env: Env, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "learn", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: sources, error: sourcesError } = await db
    .from("sources")
    .select("id, weight, weight_locked")
    .eq("owner_id", env.OWNER_ID)
    .eq("weight_locked", false);
  if (sourcesError) throw new Error(`Failed to load sources: ${sourcesError.message}`);

  const net = new Map<string, number>();
  const processedFeedbackIds: string[] = [];

  // Direct source-level feedback.
  const { data: sourceFeedback } = await db
    .from("feedback")
    .select("id, target_id, signal")
    .eq("owner_id", env.OWNER_ID)
    .eq("target_type", "source")
    .is("applied_to_weight_at", null);
  for (const row of (sourceFeedback ?? []) as FeedbackRow[]) {
    const delta = POSITIVE_SIGNALS.includes(row.signal) ? 1 : NEGATIVE_SIGNALS.includes(row.signal) ? -1 : 0;
    net.set(row.target_id, (net.get(row.target_id) ?? 0) + delta);
    processedFeedbackIds.push(row.id);
  }

  // Story-level feedback, attributed to each source behind that story's items.
  const { data: storyFeedback } = await db
    .from("feedback")
    .select("id, target_id, signal")
    .eq("owner_id", env.OWNER_ID)
    .eq("target_type", "story")
    .is("applied_to_weight_at", null)
    .in("signal", [...POSITIVE_SIGNALS, ...NEGATIVE_SIGNALS]);

  if (storyFeedback && storyFeedback.length > 0) {
    const storyIds = storyFeedback.map((r) => r.target_id);
    const { data: storyItems } = await db
      .from("story_items")
      .select("story_id, items(source_id)")
      .in("story_id", storyIds);

    const sourceIdsByStory = new Map<string, string[]>();
    for (const row of (storyItems ?? []) as unknown as { story_id: string; items: { source_id: string } | null }[]) {
      if (!row.items?.source_id) continue;
      const list = sourceIdsByStory.get(row.story_id) ?? [];
      list.push(row.items.source_id);
      sourceIdsByStory.set(row.story_id, list);
    }

    for (const row of storyFeedback as FeedbackRow[]) {
      const delta = POSITIVE_SIGNALS.includes(row.signal) ? 1 : -1;
      for (const sourceId of sourceIdsByStory.get(row.target_id) ?? []) {
        net.set(sourceId, (net.get(sourceId) ?? 0) + delta);
      }
      processedFeedbackIds.push(row.id);
    }
  }

  let adjusted = 0;
  for (const source of (sources ?? []) as SourceRow[]) {
    const netSignal = net.get(source.id);
    if (!netSignal) continue;

    const delta = Math.max(-MAX_STEP, Math.min(MAX_STEP, netSignal * ADJUSTMENT_PER_NET_SIGNAL));
    const newWeight = Math.max(0, Math.min(1, source.weight + delta));
    if (newWeight === source.weight) continue;

    await db.from("sources").update({ weight: Math.round(newWeight * 100) / 100 }).eq("id", source.id);
    adjusted++;
  }

  if (processedFeedbackIds.length > 0) {
    await db.from("feedback").update({ applied_to_weight_at: new Date().toISOString() }).in("id", processedFeedbackIds);
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "ok",
      stats: { stage: "learn", date, adjusted, feedbackProcessed: processedFeedbackIds.length },
    })
    .eq("id", run.id);

  console.log(`learn stage done: ${adjusted} source weights adjusted from ${processedFeedbackIds.length} new feedback signals`);
}
