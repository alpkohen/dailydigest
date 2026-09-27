import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildStoryEnrichPrompt, callLlm, storyEnrichSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { runPool } from "../lib/pool.js";

const CONCURRENCY = 8;
// Only stories good enough to make the brief get the expensive strong-model
// enrichment call (SPEC.md section 6, stage 8: "For stories that will
// appear in the brief").
// Tier 3 ("worth_reading" in the composed brief) is still eligible, not
// just tiers 1-2, so every story that could appear in the brief gets a
// summary to compose from.
const MAX_TIER_TO_ENRICH = 3;

interface StoryItemRow {
  items: {
    title: string;
    standfirst: string | null;
    language: string | null;
    sources: { name: string; perspective_groups: { name: string } | null } | null;
  } | null;
}

export async function runEnrichStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "enrich", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: stories, error: storiesError } = await db
    .from("stories")
    .select("id")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "open")
    .lte("tier", MAX_TIER_TO_ENRICH)
    .is("summary", null);
  if (storiesError) throw new Error(`Failed to load stories: ${storiesError.message}`);

  let enriched = 0;

  await runPool((stories ?? []) as { id: string }[], CONCURRENCY, async (story) => {
    const { data: storyItems, error } = await db
      .from("story_items")
      .select("items(title, standfirst, language, sources(name, perspective_groups(name)))")
      .eq("story_id", story.id);
    if (error || !storyItems) return;

    const items = (storyItems as unknown as StoryItemRow[])
      .map((row) => row.items)
      .filter((item): item is NonNullable<StoryItemRow["items"]> => Boolean(item))
      .map((item) => ({
        title: item.title,
        standfirst: item.standfirst,
        language: item.language,
        sourceName: item.sources?.name ?? "?",
        perspectiveGroup: item.sources?.perspective_groups?.name ?? null,
      }));
    if (items.length === 0) return;

    try {
      const result = await callLlm({
        role: "strong",
        promptName: "story_enrich",
        prompt: buildStoryEnrichPrompt({ items }),
        schema: storyEnrichSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        runId: run.id,
        stage: "enrich",
        maxTokens: 1024,
      });

      await db
        .from("stories")
        .update({
          summary: result.summary,
          what_changed: result.what_changed,
          why_it_matters: result.why_it_matters,
          watch_next: result.watch_next,
          framing: result.framing,
          entities: result.entities,
        })
        .eq("id", story.id);
      enriched++;
    } catch (err) {
      console.error(`enrich: failed enriching story ${story.id}: ${(err as Error).message}`);
    }
  });

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "enrich", date, enriched } })
    .eq("id", run.id);

  console.log(`enrich stage done: ${enriched} stories enriched`);
}
