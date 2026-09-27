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

  return (
    <main>
      <h1 className="h1-serif">Konular</h1>
      <TopicForm />
      {withPrecision.map((t) => (
        <div key={t.id}>
          <TopicRow id={t.id} name={t.name} priority={t.priority} frequency={t.frequency} active={t.active} />
          {t.precision.precision !== null && (
            <p
              className={t.precision.precision < PRECISION_SUGGESTION_THRESHOLD ? "text-danger" : "text-faint"}
              style={{ fontSize: 11, margin: "-6px 0 10px" }}
            >
              Kesinlik: %{Math.round(t.precision.precision * 100)} ({t.precision.sampleSize} geri bildirim)
              {t.precision.precision < PRECISION_SUGGESTION_THRESHOLD && " · Tanımı gözden geçirmeyi düşün"}
            </p>
          )}
        </div>
      ))}
      {withPrecision.length === 0 && <p className="empty">Henüz konu yok.</p>}
    </main>
  );
}
