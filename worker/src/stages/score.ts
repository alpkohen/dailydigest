import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildStoryScorePrompt, callLlm, storyScoreSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { runPool } from "../lib/pool.js";

const CONCURRENCY = 10;

const TIER_WEIGHT: Record<number, number> = { 1: 30, 2: 20, 3: 10 };
const NOVELTY_BONUS: Record<string, number> = { new: 8, continuation: 4, repetition: 0 };
const TOPIC_PRIORITY_BONUS: Record<string, number> = { high: 6, normal: 3, low: 0 };

export interface RankScoreInputs {
  tier: number;
  novelty: string;
  topicPriority: string | null;
  avgSourceWeight: number | null;
  sourceCount: number;
}

/**
 * SPEC.md section 6, stage 7: "Final rank combines tier, novelty, topic
 * priority, source weights and source count." A code review found this
 * only ever combining tier and source count - topic priority and source
 * weight were never layered in, even though both already existed
 * (topics.priority, sources.weight/M6 feedback-driven drift) by the time
 * this stage was written. Extracted as a pure function so the formula is
 * unit-testable without a database.
 */
export function computeRankScore(inputs: RankScoreInputs): number {
  const tierWeight = TIER_WEIGHT[inputs.tier] ?? 0;
  const noveltyBonus = NOVELTY_BONUS[inputs.novelty] ?? 0;
  const priorityBonus = TOPIC_PRIORITY_BONUS[inputs.topicPriority ?? "normal"] ?? 0;
  // Source weight is 0-1; scaled to roughly the same order of magnitude as
  // the other bonuses instead of being drowned out by them.
  const sourceWeightBonus = (inputs.avgSourceWeight ?? 0.5) * 10;
  return tierWeight + noveltyBonus + priorityBonus + sourceWeightBonus + inputs.sourceCount;
}

interface StoryItemSourceRow {
  items: { sources: { weight: number | null } | null } | null;
}

async function fetchAvgSourceWeight(db: ReturnType<typeof createServiceRoleClient>, storyId: string): Promise<number | null> {
  const { data } = await db.from("story_items").select("items(sources(weight))").eq("story_id", storyId);
  const weights = ((data ?? []) as unknown as StoryItemSourceRow[])
    .map((row) => row.items?.sources?.weight)
    .filter((w): w is number => typeof w === "number");
  if (weights.length === 0) return null;
  return weights.reduce((sum, w) => sum + w, 0) / weights.length;
}

async function fetchTopTopicPriority(db: ReturnType<typeof createServiceRoleClient>, storyId: string): Promise<string | null> {
  const { data } = await db.from("story_topics").select("topics(priority)").eq("story_id", storyId);
  const priorities = ((data ?? []) as unknown as { topics: { priority: string } | null }[])
    .map((row) => row.topics?.priority)
    .filter((p): p is string => Boolean(p));
  if (priorities.includes("high")) return "high";
  if (priorities.includes("normal")) return "normal";
  if (priorities.length > 0) return "low";
  return null;
}

/**
 * SPEC.md section 6, stage 7 "Score stories": mid model assigns importance
 * tier and novelty; final rank combines tier, novelty, topic priority,
 * source weights and source count (computeRankScore above).
 */
export async function runScoreStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "score", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: stories, error: storiesError } = await db
    .from("stories")
    .select("id, novelty, story_items(count)")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "open")
    .is("tier", null);
  if (storiesError) throw new Error(`Failed to load stories: ${storiesError.message}`);

  let scored = 0;
  let failed = 0;
  let droppedAsRepetition = 0;

  await runPool((stories ?? []) as { id: string; novelty: string | null; story_items: { count: number }[] }[], CONCURRENCY, async (story) => {
    const { data: items } = await db
      .from("story_items")
      .select("items(title)")
      .eq("story_id", story.id);
    const titles = ((items ?? []) as unknown as { items: { title: string } | null }[])
      .map((row) => row.items?.title)
      .filter((t): t is string => Boolean(t));
    if (titles.length === 0) return;

    const sourceCount = story.story_items?.[0]?.count ?? titles.length;

    try {
      const result = await callLlm({
        role: "mid",
        promptName: "story_score",
        prompt: buildStoryScorePrompt({ itemTitles: titles, sourceCount, isFirstCoverage: story.novelty === "new" }),
        schema: storyScoreSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        runId: run.id,
        stage: "score",
        maxTokens: 256,
      });

      const [avgSourceWeight, topicPriority] = await Promise.all([
        fetchAvgSourceWeight(db, story.id),
        fetchTopTopicPriority(db, story.id),
      ]);
      const rankScore = computeRankScore({ tier: result.tier, novelty: result.novelty, topicPriority, avgSourceWeight, sourceCount });

      // SPEC.md section 6, stage 7: "Repetitions with no new facts are
      // dropped from the brief." Closing the story here (rather than just
      // scoring it) removes it from compose_brief's candidate query
      // (status = "open") and from any other stage that only looks at
      // open stories, instead of relying on every future consumer to
      // remember to filter novelty = "repetition" itself.
      const isRepetition = result.novelty === "repetition";
      await db
        .from("stories")
        .update({
          tier: result.tier,
          novelty: result.novelty,
          rank_score: rankScore,
          status: isRepetition ? "closed" : "open",
        })
        .eq("id", story.id);
      if (isRepetition) droppedAsRepetition++;
      scored++;
    } catch (err) {
      failed++;
      console.error(`score: failed scoring story ${story.id}: ${(err as Error).message}`);
    }
  });

  // A code review found this always writing status "ok" even when
  // individual stories failed (only console.error'd), giving no signal
  // anywhere that some stories never got a tier and won't reach the brief.
  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "ok",
      stats: { stage: "score", date, attempted: (stories ?? []).length, scored, failed, droppedAsRepetition },
    })
    .eq("id", run.id);

  console.log(`score stage done: ${scored} stories scored, ${failed} failed, ${droppedAsRepetition} dropped as repetition`);
}
