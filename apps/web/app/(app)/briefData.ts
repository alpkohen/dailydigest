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
}

export interface TodayViewProps {
  periodDate: string;
  headline: string;
  stories: TodayStory[];
  research: TodayResearchItem[];
  outsideRadar: TodayOutsideRadar | null;
  watchlist: TodayWatchlistItem[];
  questionWidget: TodayQuestionWidget | null;
  briefTime?: string;
  savedStoryIds: string[];
  savedItemIds: string[];
}

export async function loadTodayViewProps(supabase: SupabaseClient, brief: BriefRow): Promise<TodayViewProps> {
  const { data: briefStories } = await supabase
    .from("brief_stories")
    .select("section, position, stories(id, title, summary, why_it_matters, tier, story_topics(topics(name)))")
    .eq("brief_id", brief.id)
    .order("position");

  type BriefStoryRow = {
    section: string;
    stories: {
      id: string;
      title: string;
      summary: string | null;
      why_it_matters: string | null;
      tier: number | null;
      story_topics: { topics: { name: string } | null }[];
    } | null;
  };

  const rows = ((briefStories ?? []) as unknown as BriefStoryRow[]).filter((r) => r.stories);
  const storyIds = rows.map((r) => r.stories!.id);

  const countsByStory = new Map<string, { sources: Set<string>; perspectives: Set<string> }>();
  if (storyIds.length > 0) {
    const { data: storyItemRows } = await supabase
      .from("story_items")
      .select("story_id, items(sources(id, perspective_group_id))")
      .in("story_id", storyIds);

    type ItemRow = { story_id: string; items: { sources: { id: string; perspective_group_id: string | null } | null } | null };
    for (const row of (storyItemRows ?? []) as unknown as ItemRow[]) {
      const bucket = countsByStory.get(row.story_id) ?? { sources: new Set<string>(), perspectives: new Set<string>() };
      if (row.items?.sources?.id) bucket.sources.add(row.items.sources.id);
      if (row.items?.sources?.perspective_group_id) bucket.perspectives.add(row.items.sources.perspective_group_id);
      countsByStory.set(row.story_id, bucket);
    }
  }

  const stories: TodayStory[] = rows.map((row) => ({
    id: row.stories!.id,
    title: row.stories!.title,
    summary: row.stories!.summary ?? "",
    tier: row.stories!.tier ?? SECTION_TIER[row.section] ?? 3,
    section: row.section,
    topics: row.stories!.story_topics.map((st) => st.topics?.name).filter((n): n is string => Boolean(n)),
    whyItMatters: row.stories!.why_it_matters,
    sourceCount: countsByStory.get(row.stories!.id)?.sources.size,
    perspectiveCount: countsByStory.get(row.stories!.id)?.perspectives.size,
  }));

  const content = brief.content as BriefContent | null;

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

  // Rail widget: most recently touched active question that has at least
  // one piece of evidence, so the link always resolves to a real story.
  let questionWidget: TodayQuestionWidget | null = null;
  const { data: activeQuestions } = await supabase
    .from("questions")
    .select("id, text")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(5);

  for (const q of activeQuestions ?? []) {
    const { data: evidence } = await supabase
      .from("question_evidence")
      .select("note, stories(id, title)")
      .eq("question_id", q.id)
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
  let briefTime: string | undefined;

  if (userData.user) {
    const { data: savedRows } = await supabase
      .from("reading_list")
      .select("story_id, item_id")
      .eq("owner_id", userData.user.id);
    savedStoryIds = (savedRows ?? []).map((r: { story_id: string | null }) => r.story_id).filter((v: string | null): v is string => Boolean(v));
    savedItemIds = (savedRows ?? []).map((r: { item_id: string | null }) => r.item_id).filter((v: string | null): v is string => Boolean(v));

    const { data: profile } = await supabase
      .from("profiles")
      .select("brief_time")
      .eq("owner_id", userData.user.id)
      .maybeSingle();
    briefTime = profile?.brief_time?.slice(0, 5);
  }

  return {
    periodDate: brief.period_date,
    headline: content?.headline ?? "",
    stories,
    research,
    outsideRadar,
    watchlist: content?.watchlist ?? [],
    questionWidget,
    briefTime,
    savedStoryIds,
    savedItemIds,
  };
}
