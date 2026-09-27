import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
      <p style={{ fontSize: 12, color: "#888" }}>Tier {story.tier ?? "?"}</p>
      <h1 style={{ fontSize: 22, marginTop: 0 }}>{story.title}</h1>

      {topics.length > 0 && (
        <p style={{ fontSize: 12, color: "#666" }}>{topics.join(" · ")}</p>
      )}

      <FeedbackButtons storyId={story.id} />

      {story.summary && (
        <section style={{ margin: "16px 0" }}>
          <h2 style={{ fontSize: 15 }}>Özet</h2>
          <p style={{ fontSize: 14, lineHeight: "21px" }}>{story.summary}</p>
        </section>
      )}

      {story.what_changed && (
        <section style={{ margin: "16px 0" }}>
          <h2 style={{ fontSize: 15 }}>Ne değişti</h2>
          <p style={{ fontSize: 14, lineHeight: "21px" }}>{story.what_changed}</p>
        </section>
      )}

      {story.why_it_matters && (
        <section style={{ margin: "16px 0" }}>
          <h2 style={{ fontSize: 15 }}>Neden önemli</h2>
          <p style={{ fontSize: 14, lineHeight: "21px" }}>{story.why_it_matters}</p>
        </section>
      )}

      {story.watch_next && (
        <section style={{ margin: "16px 0" }}>
          <h2 style={{ fontSize: 15 }}>Sırada ne var</h2>
          <p style={{ fontSize: 14, lineHeight: "21px" }}>{story.watch_next}</p>
        </section>
      )}

      {entities.length > 0 && (
        <section style={{ margin: "16px 0" }}>
          <h2 style={{ fontSize: 15 }}>Öne çıkan isimler / kurumlar</h2>
          <p style={{ fontSize: 13, color: "#444" }}>{entities.join(", ")}</p>
        </section>
      )}

      {perspectiveGroupCount >= 2 && framing.length > 0 && (
        <section style={{ margin: "16px 0" }}>
          <h2 style={{ fontSize: 15 }}>Perspektif karşılaştırması</h2>
          {framing.map((f) => (
            <div key={f.perspective_group} style={{ margin: "8px 0" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{f.perspective_group}</div>
              <div style={{ fontSize: 13, color: "#444" }}>{f.summary}</div>
            </div>
          ))}
        </section>
      )}

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 15 }}>Kaynaklar ({items.length})</h2>
        {items.map((item, i) => (
          <a
            key={i}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            style={{ display: "block", padding: "8px 0", borderBottom: "1px solid #f0f0f0", color: "inherit", textDecoration: "none" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: "#888" }}>
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
