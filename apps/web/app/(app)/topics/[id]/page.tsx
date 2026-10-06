import { notFound } from "next/navigation";
import Link from "next/link";
import { loadTopicCoverage } from "@dailydigest/db";
import { loadWebConfig } from "@/lib/config";
import { computeTopicPrecision, PRECISION_SUGGESTION_THRESHOLD } from "@/lib/precision";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MoreSourcesButton } from "../MoreSourcesButton";
import { SuggestionRow } from "../SuggestionRow";

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, name, description, queries_tr, queries_en, exclusions, priority, frequency, active, sources_suggested_at")
    .eq("id", id)
    .maybeSingle();
  if (!topic) notFound();

  const precision = await computeTopicPrecision(supabase, id);

  const { limits } = await loadWebConfig();
  const coverage = topic.active
    ? (await loadTopicCoverage(supabase, limits.pipeline.coverage).catch(() => [])).find((c) => c.topicId === id) ?? null
    : null;

  const { data: suggestionRows } = await supabase
    .from("topic_source_suggestions")
    .select("id, name, homepage, reason, source_type, recent_items, status, check_note")
    .eq("topic_id", id)
    .order("created_at", { ascending: false });
  // Working feeds first, then the ones the owner may still want to look at;
  // dismissed ones are hidden.
  const STATUS_ORDER = ["ok", "stale", "no_feed", "blocked", "added"];
  const suggestions = (suggestionRows ?? [])
    .filter((s) => s.status !== "dismissed")
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

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

      {coverage && (
        <section className="section">
          <h2 className="h2-section">Coverage</h2>
          <p className="row-summary" style={{ fontSize: 13 }}>
            {coverage.items} items from {coverage.sources} sources in the last {limits.pipeline.coverage.window_days} days.
          </p>
          {coverage.warnings.map((w) => (
            <p key={w} className="text-danger" style={{ fontSize: 13 }}>
              {w}
            </p>
          ))}
        </section>
      )}

      <section className="section">
        <h2 className="h2-section">Suggested sources ({suggestions.filter((s) => s.status === "ok" || s.status === "stale").length})</h2>
        <p className="text-faint" style={{ fontSize: 12 }}>
          Publications that cover this topic and are not followed yet. Each feed was checked before it is listed; adding one starts collecting it on the next run.
        </p>
        {suggestions.map((s) => (
          <SuggestionRow
            key={s.id}
            id={s.id}
            topicId={id}
            name={s.name}
            homepage={s.homepage}
            reason={s.reason}
            sourceType={s.source_type}
            recentItems={s.recent_items}
            status={s.status}
            note={s.check_note}
          />
        ))}
        {suggestions.length === 0 && topic.sources_suggested_at && <p className="empty">No new sources found.</p>}
        <MoreSourcesButton topicId={id} queued={!topic.sources_suggested_at} />
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
