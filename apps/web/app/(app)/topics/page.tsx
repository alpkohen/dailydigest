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

  return (
    <main>
      <h1 style={{ fontSize: 20 }}>Konular</h1>
      <TopicForm />
      {(topics ?? []).map((t) => (
        <TopicRow key={t.id} id={t.id} name={t.name} priority={t.priority} frequency={t.frequency} active={t.active} />
      ))}
      {(topics ?? []).length === 0 && <p style={{ color: "#888", fontSize: 14 }}>Henüz konu yok.</p>}
    </main>
  );
}
