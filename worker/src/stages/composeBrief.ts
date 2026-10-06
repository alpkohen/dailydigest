import { createServiceRoleClient, loadTopicCoverage, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildDailyOverviewPrompt, callLlm, dailyOverviewSchema } from "@dailydigest/llm";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

const LOOKBACK_HOURS = 24;
const OVERVIEW_STORY_COUNT = 12;
const SECTION_BY_TIER: Record<number, "critical" | "follow_up" | "worth_reading"> = {
  1: "critical",
  2: "follow_up",
  3: "worth_reading",
};

interface StoryRow {
  id: string;
  title: string;
  summary: string | null;
  tier: number | null;
  story_topics: { topics: { name: string } | null }[];
  story_items: { item_id: string }[];
}

interface ResearchRow {
  id: string;
  item_id: string;
  argument: string | null;
  items: { title: string; url: string } | null;
}

/**
 * Stories link to their own app page, which lists every source article with
 * a link to the original (CLAUDE.md rule 6).
 */
function storyUrl(env: Env, storyId: string): string {
  return `${env.WEB_APP_URL}/story/${storyId}`;
}

async function fetchWatchlistItems(env: Env, db: SupabaseClient, since: string) {
  const { data: rows } = await db
    .from("watch_items")
    .select("created_at, watches(name), items(id, title, url)")
    .eq("owner_id", env.OWNER_ID)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  return ((rows ?? []) as unknown as { watches: { name: string } | null; items: { id: string; title: string; url: string } | null }[])
    .filter((r) => r.items)
    .map((r) => ({ id: r.items!.id, title: r.items!.title, url: r.items!.url, watchName: r.watches?.name ?? "?" }));
}

async function sourceHealth(env: Env, db: SupabaseClient) {
  const { data } = await db
    .from("sources")
    .select("name, health_status")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true)
    .in("type", ["rss", "sitemap", "scrape", "api_openalex"]);
  const rows = data ?? [];
  const failing = rows.filter((s) => s.health_status === "broken" || s.health_status === "degraded").map((s) => s.name as string);
  return { total: rows.length, ok: rows.length - failing.length, failing };
}

// A coverage check that fails must not block the brief.
async function coverageGaps(env: Env, db: SupabaseClient, limits: LimitsConfig) {
  try {
    const coverage = await loadTopicCoverage(db, limits.pipeline.coverage, env.OWNER_ID);
    return coverage.filter((c) => c.warnings.length > 0).map((c) => ({ topic: c.topicName, warnings: c.warnings }));
  } catch (err) {
    console.error(`compose_brief: coverage check failed: ${(err as Error).message}`);
    return [];
  }
}

async function writeOverview(
  env: Env,
  models: ModelsConfig,
  db: SupabaseClient,
  runId: string,
  stories: { title: string; summary: string; topic: string | null; sourceCount: number }[],
): Promise<string> {
  const fallback = `Son 24 saatte ${stories.length} gelişme izlendi.`;
  if (stories.length === 0) return "Son 24 saatte takip ettiğin konularda yeni bir gelişme yok.";
  try {
    const result = await callLlm({
      role: "mid",
      promptName: "daily_overview",
      prompt: buildDailyOverviewPrompt({ stories: stories.slice(0, OVERVIEW_STORY_COUNT) }),
      schema: dailyOverviewSchema,
      modelsConfig: models,
      apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
      db,
      ownerId: env.OWNER_ID,
      runId,
      stage: "compose_brief",
      maxTokens: 600,
    });
    return result.overview.replace(/\s*[—–]\s*/g, ", ").trim() || fallback;
  } catch (err) {
    console.error(`compose_brief: overview failed, using fallback: ${(err as Error).message}`);
    return fallback;
  }
}

/**
 * Compose the daily brief from the last 24 hours of events: sections by
 * tier, most-covered first, capped for the email (the app lists everything).
 * The only LLM call is a short overview paragraph, with a plain fallback.
 */
export async function runComposeBriefStage(env: Env, models: ModelsConfig, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // One daily brief per date: a rerun must not create a second one.
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

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: storyRows, error: storiesError } = await db
    .from("stories")
    .select("id, title, summary, tier, story_topics(topics(name)), story_items(item_id)")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "open")
    .gte("last_updated_at", since)
    .not("tier", "is", null)
    .limit(1000);
  if (storiesError) throw new Error(`Failed to load stories: ${storiesError.message}`);

  const stories = ((storyRows ?? []) as unknown as StoryRow[])
    .map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary ?? "",
      tier: s.tier ?? 3,
      topics: s.story_topics.map((st) => st.topics?.name).filter((n): n is string => Boolean(n)),
      sourceCount: s.story_items.length,
    }))
    .sort((a, b) => a.tier - b.tier || b.sourceCount - a.sourceCount);

  const { data: usedRefRows } = await db
    .from("brief_content_refs")
    .select("ref_id")
    .eq("owner_id", env.OWNER_ID)
    .eq("content_type", "research_item");
  const usedResearch = new Set((usedRefRows ?? []).map((r) => r.ref_id as string));
  const { data: researchRows } = await db
    .from("research_items")
    .select("id, item_id, argument, items(title, url)")
    .eq("owner_id", env.OWNER_ID)
    .not("argument", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const research = ((researchRows ?? []) as unknown as ResearchRow[]).filter((r) => !usedResearch.has(r.id)).slice(0, 5);

  const caps = limits.pipeline.brief_section_caps;
  const sections = (["critical", "follow_up", "worth_reading"] as const).map((section) => ({
    section,
    items: stories
      .filter((s) => SECTION_BY_TIER[s.tier] === section)
      .slice(0, caps[section])
      .map((s) => ({ id: s.id, title: s.title, summary: s.summary, url: storyUrl(env, s.id) })),
  }));
  const researchSection = {
    section: "new_research" as const,
    items: research.map((r) => ({ id: r.id, title: r.items?.title, argument: r.argument ?? "", itemId: r.item_id, url: r.items?.url })),
  };

  const topicCounts = new Map<string, number>();
  for (const s of stories) for (const t of s.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);

  const headline = await writeOverview(
    env,
    models,
    db,
    run.id,
    stories.map((s) => ({ title: s.title, summary: s.summary, topic: s.topics[0] ?? null, sourceCount: s.sourceCount })),
  );
  const watchlist = await fetchWatchlistItems(env, db, since);

  const content = {
    headline,
    sections: [...sections, researchSection],
    outsideRadar: null,
    watchlist,
    topicCounts: [...topicCounts.entries()].map(([name, count]) => ({ name, stories: count })).sort((a, b) => b.stories - a.stories),
    totalStories: stories.length,
    sourceHealth: await sourceHealth(env, db),
    coverageGaps: await coverageGaps(env, db, limits),
    appUrl: env.WEB_APP_URL,
  };

  let position = 0;
  const briefStoryRows = sections.flatMap((section) =>
    section.items.map((item) => ({ story_id: item.id, section: section.section, position: position++ })),
  );
  const contentRefs = [
    ...research.map((r) => ({ content_type: "research_item", ref_id: r.id })),
    ...watchlist.map((w) => ({ content_type: "watchlist_item", ref_id: w.id })),
  ];

  // The brief and its brief_stories/brief_content_refs rows land together
  // in one function call (migrations 0021, 0022).
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
      .update({ finished_at: new Date().toISOString(), status: "failed", stats: { stage: "compose_brief", date, error: briefError?.message } })
      .eq("id", run.id);
    throw new Error(`Failed to create brief: ${briefError?.message}`);
  }

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "compose_brief", date, briefId, stories: stories.length } })
    .eq("id", run.id);

  console.log(`compose_brief stage done: brief ${briefId} from ${stories.length} stories in the last ${LOOKBACK_HOURS}h`);
}
