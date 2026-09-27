import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AiTag } from "@/components/AiTag";
import { AskStory } from "./AskStory";
import { FeedbackButtons } from "./FeedbackButtons";

interface StoryItemRow {
  items: {
    title: string;
    url: string;
    language: string | null;
    published_at: string | null;
    sources: { name: string; perspective_groups: { name: string } | null } | null;
  } | null;
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: story } = await supabase
    .from("stories")
    .select("id, title, summary, what_changed, why_it_matters, watch_next, framing, entities, tier, story_topics(topics(name))")
    .eq("id", id)
    .maybeSingle();

  if (!story) notFound();

  const { data: storyItems } = await supabase
    .from("story_items")
    .select("items(title, url, language, published_at, sources(name, perspective_groups(name)))")
    .eq("story_id", id);

  const items = ((storyItems ?? []) as unknown as StoryItemRow[]).map((row) => row.items).filter((i): i is NonNullable<StoryItemRow["items"]> => Boolean(i));

  const topics = (story.story_topics as unknown as { topics: { name: string } | null }[]).map((st) => st.topics?.name).filter((n): n is string => Boolean(n));
  const framing = (story.framing ?? []) as { perspective_group: string; summary: string }[];
  const entities = (story.entities ?? []) as string[];
  const perspectiveGroupCount = new Set(items.map((i) => i.sources?.perspective_groups?.name).filter(Boolean)).size;

  return (
    <main>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="badge badge-critical">Tier {story.tier ?? "?"}</span>
        {story.summary && <AiTag label="AI-enriched" />}
      </div>
      <h1 className="h1-serif" style={{ marginTop: 10 }}>{story.title}</h1>

      {topics.length > 0 && <p className="row-meta" style={{ fontSize: 12 }}>{topics.join(" · ")}</p>}

      <FeedbackButtons storyId={story.id} />

      {story.summary && (
        <section className="section">
          <h2 className="h2-section">Summary</h2>
          <p className="dek" style={{ color: "var(--text)" }}>{story.summary}</p>
        </section>
      )}

      {story.what_changed && (
        <section className="section">
          <h2 className="h2-section">What changed</h2>
          <p className="dek" style={{ color: "var(--text)" }}>{story.what_changed}</p>
        </section>
      )}

      {story.why_it_matters && (
        <section className="section">
          <h2 className="h2-section">Why it matters</h2>
          <p className="dek" style={{ color: "var(--text)" }}>{story.why_it_matters}</p>
        </section>
      )}

      {story.watch_next && (
        <section className="section">
          <h2 className="h2-section">What&apos;s next</h2>
          <p className="dek" style={{ color: "var(--text)" }}>{story.watch_next}</p>
        </section>
      )}

      {entities.length > 0 && (
        <section className="section">
          <h2 className="h2-section">Key names &amp; institutions</h2>
          <p className="row-summary">{entities.join(", ")}</p>
        </section>
      )}

      {perspectiveGroupCount >= 2 && framing.length > 0 && (
        <section className="section">
          <h2 className="h2-section">Perspective comparison</h2>
          {framing.map((f) => (
            <div key={f.perspective_group} style={{ margin: "12px 0" }}>
              <div className="row-title">{f.perspective_group}</div>
              <div className="row-summary">{f.summary}</div>
            </div>
          ))}
        </section>
      )}

      <section className="section">
        <h2 className="h2-section">Sources ({items.length})</h2>
        {items.map((item, i) => (
          <a key={i} href={item.url} target="_blank" rel="noreferrer" className="row-link">
            <div className="row-title">{item.title}</div>
            <div className="row-meta">
              {item.sources?.name ?? "?"}
              {item.sources?.perspective_groups?.name ? ` · ${item.sources.perspective_groups.name}` : ""}
              {item.language ? ` · ${item.language}` : ""}
            </div>
          </a>
        ))}
      </section>

      <AskStory storyId={story.id} />
    </main>
  );
}
