import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildStoryScorePrompt, callLlm, storyScoreSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { runPool } from "../lib/pool.js";

const CONCURRENCY = 10;

/**
 * SPEC.md section 6, stage 7 "Score stories": mid model assigns importance
 * tier and novelty; final rank combines tier, novelty and source count
 * (topic priority and source weight drift are layered on in later
 * milestones once topics have real priority data and M6's feedback loop
 * exists).
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

      const rankScore = (4 - result.tier) * 10 + sourceCount;
      await db
        .from("stories")
        .update({ tier: result.tier, novelty: result.novelty, rank_score: rankScore })
        .eq("id", story.id);
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
      stats: { stage: "score", date, attempted: (stories ?? []).length, scored, failed },
    })
    .eq("id", run.id);

  console.log(`score stage done: ${scored} stories scored, ${failed} failed`);
}
