import { notFound } from "next/navigation";
import Link from "next/link";
import { computeTopicPrecision, PRECISION_SUGGESTION_THRESHOLD } from "@/lib/precision";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, name, description, queries_tr, queries_en, exclusions, priority, frequency, active")
    .eq("id", id)
    .maybeSingle();
  if (!topic) notFound();

  const precision = await computeTopicPrecision(supabase, id);

  const { data: storyTopics } = await supabase
    .from("story_topics")
    .select("stories(id, title, tier, first_seen_at)")
    .eq("topic_id", id);

  type Row = { stories: { id: string; title: string; tier: number | null; first_seen_at: string } | null };
  const stories = ((storyTopics ?? []) as unknown as Row[])
    .map((r) => r.stories)
    .filter((s): s is NonNullable<Row["stories"]> => Boolean(s))
    .sort((a, b) => Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at));

  return (
    <main>
      <h1 className="h1-serif">{topic.name}</h1>
      <span className={`badge ${topic.active ? "badge-accent" : "badge-neutral"}`}>
        {topic.priority} · {topic.frequency} · {topic.active ? "active" : "inactive"}
      </span>
      {topic.description && <p className="dek" style={{ marginTop: 12 }}>{topic.description}</p>}

      <section className="section">
        <h2 className="h2-section">Queries</h2>
        <p className="row-summary">TR: {(topic.queries_tr ?? []).join(" | ")}</p>
        <p className="row-summary">EN: {(topic.queries_en ?? []).join(" | ")}</p>
        {topic.exclusions?.length > 0 && <p className="text-faint" style={{ fontSize: 13 }}>Excluded: {topic.exclusions.join(", ")}</p>}
      </section>

      <section className="section">
        <h2 className="h2-section">Precision</h2>
        {precision.precision !== null ? (
          <p className={precision.precision < PRECISION_SUGGESTION_THRESHOLD ? "text-danger" : "row-summary"} style={{ fontSize: 13 }}>
            {Math.round(precision.precision * 100)}% of what this topic surfaced was marked relevant ({precision.sampleSize} feedback).
            {precision.precision < PRECISION_SUGGESTION_THRESHOLD && " Consider revisiting the definition."}
          </p>
        ) : (
          <p className="empty">Not enough feedback yet.</p>
        )}
      </section>

      <section className="section">
        <h2 className="h2-section">Story timeline ({stories.length})</h2>
        {stories.map((s) => (
          <Link key={s.id} href={`/story/${s.id}`} className="row-link">
            <div className="row-title">{s.title}</div>
            <div className="row-meta">
              Tier {s.tier ?? "?"} · {new Date(s.first_seen_at).toLocaleDateString("en-GB")}
            </div>
          </Link>
        ))}
        {stories.length === 0 && <p className="empty">No stories yet.</p>}
      </section>
    </main>
  );
}
