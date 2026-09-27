import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TodayView, type TodayResearchItem, type TodayStory } from "@/components/TodayView";

const SECTION_TIER: Record<string, 1 | 2 | 3> = { critical: 1, follow_up: 2, worth_reading: 3 };

export default async function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: brief } = await supabase.from("briefs").select("id, period_date, content").eq("id", id).maybeSingle();
  if (!brief) notFound();

  const { data: briefStories } = await supabase
    .from("brief_stories")
    .select("section, position, stories(id, title, summary, tier, story_topics(topics(name)))")
    .eq("brief_id", brief.id)
    .order("position");

  type BriefStoryRow = {
    section: string;
    stories: {
      id: string;
      title: string;
      summary: string | null;
      tier: number | null;
      story_topics: { topics: { name: string } | null }[];
    } | null;
  };

  const stories: TodayStory[] = ((briefStories ?? []) as unknown as BriefStoryRow[])
    .filter((row) => row.stories)
    .map((row) => ({
      id: row.stories!.id,
      title: row.stories!.title,
      summary: row.stories!.summary ?? "",
      tier: row.stories!.tier ?? SECTION_TIER[row.section] ?? 3,
      section: row.section,
      topics: row.stories!.story_topics.map((st) => st.topics?.name).filter((n): n is string => Boolean(n)),
    }));

  const content = brief.content as {
    headline: string;
    sections: { section: string; items: { id: string; title?: string; argument?: string }[] }[];
    outsideRadar?: { title: string; reason: string } | null;
    watchlist?: { id: string; title: string; url: string; watchName: string }[];
  } | null;
  const research: TodayResearchItem[] =
    content?.sections.find((s) => s.section === "new_research")?.items.map((i) => ({
      id: i.id,
      title: i.title ?? "",
      argument: i.argument ?? "",
    })) ?? [];

  return (
    <TodayView
      periodDate={brief.period_date}
      headline={content?.headline ?? ""}
      stories={stories}
      research={research}
      outsideRadar={content?.outsideRadar}
      watchlist={content?.watchlist}
    />
  );
}
