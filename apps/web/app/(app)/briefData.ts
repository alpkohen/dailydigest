import { buildTopicLines, type TopicLine } from "@dailydigest/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TodayOutsideRadar,
  TodayQuestionWidget,
  TodayResearchItem,
  TodayStory,
  TodayWatchlistItem,
} from "@/components/TodayView";

const SECTION_TIER: Record<string, 1 | 2 | 3> = { critical: 1, follow_up: 2, worth_reading: 3 };

interface BriefRow {
  id: string;
  period_date: string;
  content: unknown;
}

interface BriefContent {
  headline: string;
  sections: { section: string; items: { id: string; title?: string; argument?: string; itemId?: string }[] }[];
  outsideRadar?: { title: string; reason: string; url?: string } | null;
  watchlist?: TodayWatchlistItem[];
  topicLines?: TopicLine[];
}

export interface TodayViewProps {
  periodDate: string;
  headline: string;
  stories: TodayStory[];
  research: TodayResearchItem[];
  outsideRadar: TodayOutsideRadar | null;
  watchlist: TodayWatchlistItem[];
  questionWidget: TodayQuestionWidget | null;
  savedStoryIds: string[];
  savedItemIds: string[];
  /** One line per topic (live: from the current events; archive: as sent). */
  topicLines: TopicLine[];
  /** When the AI last processed new articles (live view only). */
  lastUpdatedAt: string | null;
  /** Events created or updated after this are marked New / Updated. */
  freshSince: string | null;
}

type StoryRecord = {
  id: string;
  title: string;
  summary: string | null;
  why_it_matters: string | null;
  tier: number | null;
  first_seen_at: string;
  last_updated_at: string;
  story_topics: { topics: { name: string } | null }[];
};

const STORY_FIELDS = "id, title, summary, why_it_matters, tier, first_seen_at, last_updated_at, story_topics(topics(name))";
const SECTION_BY_TIER: Record<number, string> = { 1: "critical", 2: "follow_up", 3: "worth_reading" };
const LIVE_WINDOW_HOURS = 24;

async function loadBriefStories(supabase: SupabaseClient, briefId: string): Promise<{ section: string; story: StoryRecord }[]> {
  const { data } = await supabase
    .from("brief_stories")
    .select(`section, position, stories(${STORY_FIELDS})`)
    .eq("brief_id", briefId)
    .order("position");
  return ((data ?? []) as unknown as { section: string; stories: StoryRecord | null }[])
    .filter((r) => r.stories)
    .map((r) => ({ section: r.section, story: r.stories! }));
}

/** Every event touched in the last 24 hours, not just the ones the email picked. */
async function loadLiveStories(supabase: SupabaseClient): Promise<{ section: string; story: StoryRecord }[]> {
  const since = new Date(Date.now() - LIVE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("stories")
    .select(STORY_FIELDS)
    .eq("status", "open")
    .gte("last_updated_at", since)
    .not("tier", "is", null)
    .not("summary", "is", null)
    .order("last_updated_at", { ascending: false })
    .limit(1000);
  return ((data ?? []) as unknown as StoryRecord[]).map((story) => ({ section: SECTION_BY_TIER[story.tier ?? 3] ?? "worth_reading", story }));
}

/**
 * The last two finished grouping runs: the latest is "last updated", the one
 * before it is the line after which an event counts as New or Updated.
 */
async function loadUpdateTimes(supabase: SupabaseClient): Promise<{ lastUpdatedAt: string | null; freshSince: string | null }> {
  const { data } = await supabase
    .from("pipeline_runs")
    .select("finished_at")
    .eq("stats->>stage", "group")
    .eq("status", "ok")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(2);
  const runs = (data ?? []) as { finished_at: string }[];
  return { lastUpdatedAt: runs[0]?.finished_at ?? null, freshSince: runs[1]?.finished_at ?? null };
}

async function loadSourceCounts(supabase: SupabaseClient, storyIds: string[]) {
  const countsByStory = new Map<string, { sources: Set<string>; perspectives: Set<string> }>();
  // Chunked: a long .in() list is sent in the request URL.
  for (let i = 0; i < storyIds.length; i += 100) {
    const { data: storyItemRows } = await supabase
      .from("story_items")
      .select("story_id, items(sources(id, perspective_group_id))")
      .in("story_id", storyIds.slice(i, i + 100));

    type ItemRow = { story_id: string; items: { sources: { id: string; perspective_group_id: string | null } | null } | null };
    for (const row of (storyItemRows ?? []) as unknown as ItemRow[]) {
      const bucket = countsByStory.get(row.story_id) ?? { sources: new Set<string>(), perspectives: new Set<string>() };
      if (row.items?.sources?.id) bucket.sources.add(row.items.sources.id);
      if (row.items?.sources?.perspective_group_id) bucket.perspectives.add(row.items.sources.perspective_group_id);
      countsByStory.set(row.story_id, bucket);
    }
  }
  return countsByStory;
}

/**
 * `brief` is the edition being viewed (or the latest one, for the home page).
 * With `live`, the story list is every event of the last 24 hours instead of
 * the brief's capped selection, so the app is always current between emails.
 */
export async function loadTodayViewProps(
  supabase: SupabaseClient,
  brief: BriefRow | null,
  options: { live?: boolean } = {},
): Promise<TodayViewProps> {
  const rows = options.live || !brief ? await loadLiveStories(supabase) : await loadBriefStories(supabase, brief.id);
  const countsByStory = await loadSourceCounts(supabase, rows.map((r) => r.story.id));

  const stories: TodayStory[] = rows.map(({ section, story }) => ({
    id: story.id,
    title: story.title,
    summary: story.summary ?? "",
    tier: story.tier ?? SECTION_TIER[section] ?? 3,
    section,
    topics: story.story_topics.map((st) => st.topics?.name).filter((n): n is string => Boolean(n)),
    whyItMatters: story.why_it_matters,
    sourceCount: countsByStory.get(story.id)?.sources.size,
    perspectiveCount: countsByStory.get(story.id)?.perspectives.size,
    firstSeenAt: story.first_seen_at,
    lastUpdatedAt: story.last_updated_at,
  }));
  const updateTimes = options.live ? await loadUpdateTimes(supabase) : { lastUpdatedAt: null, freshSince: null };
  if (options.live) {
    stories.sort((a, b) => a.tier - b.tier || (b.sourceCount ?? 0) - (a.sourceCount ?? 0));
  }

  const content = (brief?.content ?? null) as BriefContent | null;

  const research: TodayResearchItem[] =
    content?.sections.find((s) => s.section === "new_research")?.items.map((i) => ({
      id: i.id,
      title: i.title ?? "",
      argument: i.argument ?? "",
      itemId: i.itemId,
    })) ?? [];

  const outsideRadar: TodayOutsideRadar | null = content?.outsideRadar
    ? { title: content.outsideRadar.title, reason: content.outsideRadar.reason, url: content.outsideRadar.url }
    : null;

  // Keep a tracked question visible even when this edition has no new
  // evidence. Previously the entire rail disappeared in that case.
  let questionWidget: TodayQuestionWidget | null = null;
  const { data: activeQuestions } = await supabase
    .from("questions")
    .select("id, text")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(5);

  const firstQuestion = activeQuestions?.[0];
  if (firstQuestion) {
    questionWidget = {
      questionId: firstQuestion.id,
      text: firstQuestion.text,
      note: "No new evidence was linked to this edition yet.",
      storyId: null,
      storyTitle: null,
    };
  }

  for (const q of activeQuestions ?? []) {
    const { data: evidence } = await supabase
      .from("question_evidence")
      .select("note, stories(id, title)")
      .eq("question_id", q.id)
      // Relevant evidence always has a note. This also keeps the brief
      // readable while older databases wait for the latest migration.
      .not("note", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    type EvidenceRow = { note: string | null; stories: { id: string; title: string } | null };
    const e = evidence as unknown as EvidenceRow | null;
    if (e?.stories) {
      questionWidget = { questionId: q.id, text: q.text, note: e.note ?? "", storyId: e.stories.id, storyTitle: e.stories.title };
      break;
    }
  }

  const { data: userData } = await supabase.auth.getUser();
  let savedStoryIds: string[] = [];
  let savedItemIds: string[] = [];

  if (userData.user) {
    const { data: savedRows } = await supabase
      .from("reading_list")
      .select("story_id, item_id")
      .eq("owner_id", userData.user.id);
    savedStoryIds = (savedRows ?? []).map((r: { story_id: string | null }) => r.story_id).filter((v: string | null): v is string => Boolean(v));
    savedItemIds = (savedRows ?? []).map((r: { item_id: string | null }) => r.item_id).filter((v: string | null): v is string => Boolean(v));
  }

  const today = new Date().toISOString().slice(0, 10);
  const liveFallbackHeadline = `Son ${LIVE_WINDOW_HOURS} saatte ${stories.length} gelişme.`;

  return {
    // The live view is always today's edition; its framing paragraph is the
    // latest brief's only if that brief is from today.
    periodDate: options.live || !brief ? today : brief.period_date,
    headline: options.live && brief?.period_date !== today ? liveFallbackHeadline : (content?.headline ?? liveFallbackHeadline),
    stories,
    research,
    outsideRadar,
    watchlist: content?.watchlist ?? [],
    questionWidget,
    savedStoryIds,
    savedItemIds,
    topicLines: options.live
      ? buildTopicLines(stories.map((s) => ({ id: s.id, title: s.title, tier: s.tier, sourceCount: s.sourceCount ?? 0, topics: s.topics })))
      : (content?.topicLines ?? []),
    ...updateTimes,
  };
}
