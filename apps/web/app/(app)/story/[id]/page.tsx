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

  // Why this event sits under each of its topics: how its articles were
  // matched (AI, and which keywords it found).
  const { data: scoreRows } = await supabase
    .from("story_items")
    .select("items(item_topic_scores(reason, topics(name)))")
    .eq("story_id", id);
  type ScoreRow = { items: { item_topic_scores: { reason: string | null; topics: { name: string } | null }[] } | null };
  const whyByTopic = new Map<string, { articles: number; ai: number; keywords: Set<string> }>();
  for (const row of (scoreRows ?? []) as unknown as ScoreRow[]) {
    for (const sc of row.items?.item_topic_scores ?? []) {
      if (!sc.topics) continue;
      const why = whyByTopic.get(sc.topics.name) ?? { articles: 0, ai: 0, keywords: new Set<string>() };
      why.articles++;
      const reason = sc.reason ?? "";
      if (reason.startsWith("ai")) why.ai++;
      const kw = /keywords[^:]*:\s*(.+)$/.exec(reason)?.[1];
      if (kw) for (const k of kw.split(",")) why.keywords.add(k.trim());
      else if (reason === "keyword") why.keywords.add("(keyword match, earlier rule)");
      whyByTopic.set(sc.topics.name, why);
    }
  }

  const items = ((storyItems ?? []) as unknown as StoryItemRow[]).map((row) => row.items).filter((i): i is NonNullable<StoryItemRow["items"]> => Boolean(i));

  const topics = (story.story_topics as unknown as { topics: { name: string } | null }[]).map((st) => st.topics?.name).filter((n): n is string => Boolean(n));
  const framing = (story.framing ?? []) as { perspective_group: string; summary: string }[];
  const entities = (story.entities ?? []) as string[];
  const perspectiveGroupCount = new Set(items.map((i) => i.sources?.perspective_groups?.name).filter(Boolean)).size;
  const tierBadgeClass = story.tier === 1 ? "badge-critical" : story.tier === 2 ? "badge-accent" : "badge-neutral";

  return (
    <main>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`badge ${tierBadgeClass}`}>Tier {story.tier ?? "?"}</span>
        {story.summary && <AiTag label="AI-enriched" />}
      </div>
      <h1 className="h1-serif" style={{ marginTop: 10 }}>{story.title}</h1>

      {topics.length > 0 && <p className="row-meta" style={{ fontSize: 12 }}>{topics.join(" · ")}</p>}
      {whyByTopic.size > 0 && (
        <div className="text-faint" style={{ fontSize: 12, margin: "4px 0 12px" }}>
          {[...whyByTopic.entries()].map(([topic, why]) => (
            <div key={topic}>
              Why it&apos;s here: {topic}, {why.ai > 0 ? `AI matched ${why.ai} of ${why.articles} articles` : `${why.articles} articles by keyword only`}
              {why.keywords.size > 0 && ` · keywords: ${[...why.keywords].slice(0, 6).join(", ")}`}
            </div>
          ))}
        </div>
      )}

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
