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
        {topic.priority} · {topic.frequency} · {topic.active ? "aktif" : "pasif"}
      </span>
      {topic.description && <p className="dek" style={{ marginTop: 12 }}>{topic.description}</p>}

      <section className="section">
        <h2 className="h2-section">Sorgular</h2>
        <p className="row-summary">TR: {(topic.queries_tr ?? []).join(" | ")}</p>
        <p className="row-summary">EN: {(topic.queries_en ?? []).join(" | ")}</p>
        {topic.exclusions?.length > 0 && <p className="text-faint" style={{ fontSize: 13 }}>Hariç: {topic.exclusions.join(", ")}</p>}
      </section>

      <section className="section">
        <h2 className="h2-section">Kesinlik</h2>
        {precision.precision !== null ? (
          <p className={precision.precision < PRECISION_SUGGESTION_THRESHOLD ? "text-danger" : "row-summary"} style={{ fontSize: 13 }}>
            Sürülen içeriğin %{Math.round(precision.precision * 100)}&apos;i ilgili işaretlendi ({precision.sampleSize} geri bildirim).
            {precision.precision < PRECISION_SUGGESTION_THRESHOLD && " Tanımı gözden geçirmeyi düşün."}
          </p>
        ) : (
          <p className="empty">Henüz yeterli geri bildirim yok.</p>
        )}
      </section>

      <section className="section">
        <h2 className="h2-section">Story zaman çizelgesi ({stories.length})</h2>
        {stories.map((s) => (
          <Link key={s.id} href={`/story/${s.id}`} className="row-link">
            <div className="row-title">{s.title}</div>
            <div className="row-meta">
              Tier {s.tier ?? "?"} · {new Date(s.first_seen_at).toLocaleDateString("tr-TR")}
            </div>
          </Link>
        ))}
        {stories.length === 0 && <p className="empty">Henüz story yok.</p>}
      </section>
    </main>
  );
}
