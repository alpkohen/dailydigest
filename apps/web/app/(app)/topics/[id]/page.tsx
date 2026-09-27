import { notFound } from "next/navigation";
import Link from "next/link";
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
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{topic.name}</h1>
      <p style={{ fontSize: 12, color: "#888" }}>
        {topic.priority} · {topic.frequency} · {topic.active ? "aktif" : "pasif"}
      </p>
      {topic.description && <p style={{ fontSize: 14, lineHeight: "21px" }}>{topic.description}</p>}

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 14 }}>Sorgular</h2>
        <p style={{ fontSize: 13, color: "#444" }}>TR: {(topic.queries_tr ?? []).join(" | ")}</p>
        <p style={{ fontSize: 13, color: "#444" }}>EN: {(topic.queries_en ?? []).join(" | ")}</p>
        {topic.exclusions?.length > 0 && <p style={{ fontSize: 13, color: "#888" }}>Hariç: {topic.exclusions.join(", ")}</p>}
      </section>

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 14 }}>Story zaman çizelgesi ({stories.length})</h2>
        {stories.map((s) => (
          <Link
            key={s.id}
            href={`/story/${s.id}`}
            style={{ display: "block", padding: "8px 0", borderBottom: "1px solid #f0f0f0", color: "inherit", textDecoration: "none" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "#888" }}>
              Tier {s.tier ?? "?"} · {new Date(s.first_seen_at).toLocaleDateString("tr-TR")}
            </div>
          </Link>
        ))}
        {stories.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>Henüz story yok.</p>}
      </section>
    </main>
  );
}
