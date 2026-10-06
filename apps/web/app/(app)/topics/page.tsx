import { loadTopicCoverage } from "@dailydigest/db";
import { loadWebConfig } from "@/lib/config";
import { computeTopicPrecision, PRECISION_SUGGESTION_THRESHOLD } from "@/lib/precision";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TopicForm } from "./TopicForm";
import { TopicRow } from "./TopicRow";

export default async function TopicsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: topics } = await supabase
    .from("topics")
    .select("id, name, priority, frequency, active")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  const withPrecision = await Promise.all(
    (topics ?? []).map(async (t) => ({ ...t, precision: await computeTopicPrecision(supabase, t.id) })),
  );

  const { limits } = await loadWebConfig();
  const coverage = await loadTopicCoverage(supabase, limits.pipeline.coverage).catch(() => []);
  const warningsByTopic = new Map(coverage.map((c) => [c.topicId, c.warnings]));

  return (
    <main>
      <h1 className="h1-serif">Topics</h1>
      <TopicForm />
      {withPrecision.map((t) => (
        <div key={t.id}>
          <TopicRow id={t.id} name={t.name} priority={t.priority} frequency={t.frequency} active={t.active} />
          {(warningsByTopic.get(t.id) ?? []).map((w) => (
            <p key={w} className="text-danger" style={{ fontSize: 11, margin: "-6px 0 10px" }}>
              {w}
            </p>
          ))}
          {t.precision.precision !== null && (
            <p
              className={t.precision.precision < PRECISION_SUGGESTION_THRESHOLD ? "text-danger" : "text-faint"}
              style={{ fontSize: 11, margin: "-6px 0 10px" }}
            >
              Precision: {Math.round(t.precision.precision * 100)}% ({t.precision.sampleSize} feedback)
              {t.precision.precision < PRECISION_SUGGESTION_THRESHOLD && " · Consider revisiting the definition"}
            </p>
          )}
        </div>
      ))}
      {withPrecision.length === 0 && <p className="empty">No topics yet.</p>}
    </main>
  );
}
