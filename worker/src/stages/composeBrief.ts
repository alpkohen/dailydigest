import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { briefComposeSchema, buildBriefComposePrompt, buildOutsideRadarPrompt, callLlm, outsideRadarSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { validateBrief } from "../lib/briefValidator.js";

interface OutsideRadarPick {
  id: string;
  title: string;
  standfirst: string | null;
  reason: string;
}

async function pickOutsideRadar(
  env: Env,
  models: ModelsConfig,
  db: ReturnType<typeof createServiceRoleClient>,
  runId: string,
): Promise<OutsideRadarPick | null> {
  const { data: profile } = await db.from("profiles").select("interest_profile").eq("owner_id", env.OWNER_ID).maybeSingle();

  const { data: candidates } = await db
    .from("items")
    .select("id, title, standfirst")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "not_relevant")
    .order("created_at", { ascending: false })
    .limit(30);
  if (!candidates || candidates.length === 0) return null;

  try {
    const result = await callLlm({
      role: "mid",
      promptName: "outside_radar",
      prompt: buildOutsideRadarPrompt({ interestProfile: profile?.interest_profile ?? null, candidates }),
      schema: outsideRadarSchema,
      modelsConfig: models,
      apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
      db,
      ownerId: env.OWNER_ID,
      runId,
      stage: "outside_radar",
      maxTokens: 256,
    });
    if (!result.pick_id) return null;
    const picked = candidates.find((c) => c.id === result.pick_id);
    if (!picked) return null;
    return { id: picked.id, title: picked.title, standfirst: picked.standfirst, reason: result.reason };
  } catch (err) {
    console.error(`compose_brief: outside_radar failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchWatchlistItems(
  env: Env,
  db: ReturnType<typeof createServiceRoleClient>,
): Promise<{ id: string; title: string; url: string; watchName: string }[]> {
  const { data: rows } = await db
    .from("watch_items")
    .select("watches(name), items(id, title, url)")
    .eq("owner_id", env.OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(10);

  return ((rows ?? []) as unknown as { watches: { name: string } | null; items: { id: string; title: string; url: string } | null }[])
    .filter((r) => r.items)
    .map((r) => ({ id: r.items!.id, title: r.items!.title, url: r.items!.url, watchName: r.watches?.name ?? "?" }));
}

interface StoryRow {
  id: string;
  title: string;
  summary: string | null;
  tier: number | null;
  story_topics: { topics: { name: string } | null }[];
}

interface ResearchRow {
  id: string;
  argument: string | null;
  items: { title: string } | null;
}

/**
 * SPEC.md section 6, stage 10 "Compose brief": strong model writes the
 * headline block and orders sections from structured story data. Validator
 * checks every referenced id is real and scans for banned patterns before
 * the brief is stored.
 */
export async function runComposeBriefStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "compose_brief", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: alreadyBriefed } = await db
    .from("brief_stories")
    .select("story_id")
    .eq("owner_id", env.OWNER_ID);
  const briefedIds = new Set((alreadyBriefed ?? []).map((r) => r.story_id));

  const { data: storyRows, error: storiesError } = await db
    .from("stories")
    .select("id, title, summary, tier, story_topics(topics(name))")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "open")
    .not("tier", "is", null)
    .not("summary", "is", null);
  if (storiesError) throw new Error(`Failed to load stories: ${storiesError.message}`);

  const stories = ((storyRows ?? []) as unknown as StoryRow[]).filter((s) => !briefedIds.has(s.id));

  const { data: researchRows, error: researchError } = await db
    .from("research_items")
    .select("id, argument, items(title)")
    .eq("owner_id", env.OWNER_ID)
    .not("argument", "is", null);
  if (researchError) throw new Error(`Failed to load research_items: ${researchError.message}`);
  const researchItems = (researchRows ?? []) as unknown as ResearchRow[];

  if (stories.length === 0 && researchItems.length === 0) {
    console.log("compose_brief: nothing new to compose");
    await db
      .from("pipeline_runs")
      .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "compose_brief", date, composed: false } })
      .eq("id", run.id);
    return;
  }

  const promptStories = stories.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary ?? "",
    tier: s.tier,
    topicNames: s.story_topics.map((st) => st.topics?.name).filter((n): n is string => Boolean(n)),
  }));
  const promptResearch = researchItems.map((r) => ({ id: r.id, title: r.items?.title ?? "(untitled)", argument: r.argument ?? "" }));

  const composed = await callLlm({
    role: "strong",
    promptName: "brief_compose",
    prompt: buildBriefComposePrompt({ stories: promptStories, researchItems: promptResearch }),
    schema: briefComposeSchema,
    modelsConfig: models,
    apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
    db,
    ownerId: env.OWNER_ID,
    runId: run.id,
    stage: "compose_brief",
    maxTokens: 4096,
  });

  const validation = validateBrief({
    headline: composed.headline,
    sections: composed.sections,
    validStoryIds: new Set(stories.map((s) => s.id)),
    validResearchIds: new Set(researchItems.map((r) => r.id)),
  });

  if (!validation.ok) {
    console.error("compose_brief: validation failed:", validation.errors);
    await db
      .from("pipeline_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        stats: { stage: "compose_brief", date, composed: false, errors: validation.errors },
      })
      .eq("id", run.id);
    throw new Error(`Brief validation failed: ${validation.errors.join("; ")}`);
  }

  const storyById = new Map(stories.map((s) => [s.id, s]));
  const researchById = new Map(researchItems.map((r) => [r.id, r]));
  const outsideRadar = await pickOutsideRadar(env, models, db, run.id);
  const watchlist = await fetchWatchlistItems(env, db);

  const content = {
    headline: composed.headline,
    sections: composed.sections.map((section) => ({
      section: section.section,
      items:
        section.section === "new_research"
          ? section.story_ids.map((id) => ({ id, title: researchById.get(id)?.items?.title, argument: researchById.get(id)?.argument }))
          : section.story_ids.map((id) => ({ id, title: storyById.get(id)?.title, summary: storyById.get(id)?.summary })),
    })),
    outsideRadar,
    watchlist,
  };

  const { data: brief, error: briefError } = await db
    .from("briefs")
    .insert({ owner_id: env.OWNER_ID, kind: "daily", period_date: date, content, status: "ready" })
    .select("id")
    .single();
  if (briefError || !brief) throw new Error(`Failed to insert brief: ${briefError?.message}`);

  let position = 0;
  const briefStoryRows = composed.sections
    .filter((s) => s.section !== "new_research")
    .flatMap((section) => section.story_ids.map((storyId) => ({ owner_id: env.OWNER_ID, brief_id: brief.id, story_id: storyId, section: section.section, position: position++ })));
  if (briefStoryRows.length > 0) {
    const { error } = await db.from("brief_stories").insert(briefStoryRows);
    if (error) console.error(`compose_brief: failed to insert brief_stories: ${error.message}`);
  }

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "compose_brief", date, composed: true, briefId: brief.id } })
    .eq("id", run.id);

  console.log(`compose_brief stage done: brief ${brief.id} created with ${stories.length} stories and ${researchItems.length} research items`);
}
