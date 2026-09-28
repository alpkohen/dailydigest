import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { briefComposeSchema, buildBriefComposePrompt, buildOutsideRadarPrompt, callLlm, outsideRadarSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { validateBrief } from "../lib/briefValidator.js";

interface OutsideRadarPick {
  id: string;
  title: string;
  standfirst: string | null;
  reason: string;
  url: string;
}

async function pickOutsideRadar(
  env: Env,
  models: ModelsConfig,
  db: ReturnType<typeof createServiceRoleClient>,
  runId: string,
  alreadyPickedIds: Set<string>,
): Promise<OutsideRadarPick | null> {
  const { data: profile } = await db.from("profiles").select("interest_profile").eq("owner_id", env.OWNER_ID).maybeSingle();

  const { data: candidateRows } = await db
    .from("items")
    .select("id, title, standfirst, url")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "not_relevant")
    .order("created_at", { ascending: false })
    .limit(60);
  // Fetch extra and filter client-side rather than a .not("id","in",...)
  // filter, which gets unwieldy once alreadyPickedIds grows past a few
  // dozen entries - simpler to over-fetch than build a huge NOT IN list.
  const candidates = (candidateRows ?? []).filter((c) => !alreadyPickedIds.has(c.id)).slice(0, 30);
  if (candidates.length === 0) return null;

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
    return { id: picked.id, title: picked.title, standfirst: picked.standfirst, reason: result.reason, url: picked.url };
  } catch (err) {
    console.error(`compose_brief: outside_radar failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchWatchlistItems(
  env: Env,
  db: ReturnType<typeof createServiceRoleClient>,
  alreadyShownIds: Set<string>,
): Promise<{ id: string; title: string; url: string; watchName: string }[]> {
  const { data: rows } = await db
    .from("watch_items")
    .select("watches(name), items(id, title, url)")
    .eq("owner_id", env.OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(30);

  return ((rows ?? []) as unknown as { watches: { name: string } | null; items: { id: string; title: string; url: string } | null }[])
    .filter((r) => r.items && !alreadyShownIds.has(r.items.id))
    .slice(0, 10)
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
  item_id: string;
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

  // A rerun for the same date (manual retry, a slow job overlapping the
  // next day's schedule, etc) must not create a second daily brief: with
  // no such guard, deliver's .single() lookup for status='ready' would
  // find two rows and throw instead of sending anything.
  const { data: existingBrief } = await db
    .from("briefs")
    .select("id, status")
    .eq("owner_id", env.OWNER_ID)
    .eq("kind", "daily")
    .eq("period_date", date)
    .maybeSingle();
  if (existingBrief) {
    console.log(`compose_brief: a daily brief for ${date} already exists (${existingBrief.status}), skipping`);
    return;
  }

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

  // Item #7 from a 2026-09-28 code review: research items, the
  // outside-radar pick, and watchlist items had no equivalent of
  // brief_stories tracking them across days, so the same one could
  // resurface in a later brief. brief_content_refs (migration 0022) is
  // that tracking, one row per content type per ref actually used.
  const { data: usedRefRows } = await db
    .from("brief_content_refs")
    .select("content_type, ref_id")
    .eq("owner_id", env.OWNER_ID);
  const usedResearchIds = new Set((usedRefRows ?? []).filter((r) => r.content_type === "research_item").map((r) => r.ref_id));
  const usedOutsideRadarIds = new Set((usedRefRows ?? []).filter((r) => r.content_type === "outside_radar").map((r) => r.ref_id));
  const usedWatchlistIds = new Set((usedRefRows ?? []).filter((r) => r.content_type === "watchlist_item").map((r) => r.ref_id));

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
    .select("id, item_id, argument, items(title)")
    .eq("owner_id", env.OWNER_ID)
    .not("argument", "is", null);
  if (researchError) throw new Error(`Failed to load research_items: ${researchError.message}`);
  const researchItems = ((researchRows ?? []) as unknown as ResearchRow[]).filter((r) => !usedResearchIds.has(r.id));

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
  const outsideRadar = await pickOutsideRadar(env, models, db, run.id, usedOutsideRadarIds);
  const watchlist = await fetchWatchlistItems(env, db, usedWatchlistIds);

  const content = {
    headline: composed.headline,
    sections: composed.sections.map((section) => ({
      section: section.section,
      items:
        section.section === "new_research"
          ? section.story_ids.map((id) => ({
              id,
              title: researchById.get(id)?.items?.title,
              argument: researchById.get(id)?.argument,
              itemId: researchById.get(id)?.item_id,
            }))
          : section.story_ids.map((id) => ({ id, title: storyById.get(id)?.title, summary: storyById.get(id)?.summary })),
    })),
    outsideRadar,
    watchlist,
  };

  let position = 0;
  const briefStoryRows = composed.sections
    .filter((s) => s.section !== "new_research")
    .flatMap((section) => section.story_ids.map((storyId) => ({ story_id: storyId, section: section.section, position: position++ })));

  // Only research items the model actually chose (the "new_research"
  // section's story_ids) count as "used" - not every candidate that was
  // offered to it, mirroring how briefStoryRows only records chosen
  // stories, not every candidate story.
  const chosenResearchIds = composed.sections.find((s) => s.section === "new_research")?.story_ids ?? [];
  const contentRefs = [
    ...chosenResearchIds.map((id) => ({ content_type: "research_item", ref_id: id })),
    ...(outsideRadar ? [{ content_type: "outside_radar", ref_id: outsideRadar.id }] : []),
    ...watchlist.map((w) => ({ content_type: "watchlist_item", ref_id: w.id })),
  ];

  // The brief and its brief_stories/brief_content_refs rows must land
  // together: with separate inserts, a failure partway through used to
  // leave a "ready" brief on the shelf (deliver would still send it)
  // whose content was never recorded as shown, letting it resurface in a
  // later brief. create_daily_brief (migrations 0021, 0022) wraps all
  // three in one function call, which Postgres runs as a single implicit
  // transaction.
  const { data: briefId, error: briefError } = await db.rpc("create_daily_brief", {
    p_owner_id: env.OWNER_ID,
    p_period_date: date,
    p_content: content,
    p_brief_stories: briefStoryRows,
    p_content_refs: contentRefs,
  });
  if (briefError || !briefId) {
    await db
      .from("pipeline_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        stats: { stage: "compose_brief", date, composed: false, error: briefError?.message },
      })
      .eq("id", run.id);
    throw new Error(`Failed to create brief: ${briefError?.message}`);
  }

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "compose_brief", date, composed: true, briefId } })
    .eq("id", run.id);

  console.log(`compose_brief stage done: brief ${briefId} created with ${stories.length} stories and ${researchItems.length} research items`);
}
