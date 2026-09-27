import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuestionForm } from "./QuestionForm";
import { QuestionRow } from "./QuestionRow";

export default async function QuestionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: questions } = await supabase
    .from("questions")
    .select("id, text, active")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main>
      <h1 className="h1-serif">Sorular</h1>
      <QuestionForm />
      {(questions ?? []).map((q) => (
        <QuestionRow key={q.id} id={q.id} text={q.text} active={q.active} />
      ))}
      {(questions ?? []).length === 0 && <p className="empty">Henüz soru yok.</p>}
    </main>
  );
}
