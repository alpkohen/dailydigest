import { createServerSupabaseClient } from "@/lib/supabase/server";
import { QuestionForm } from "./QuestionForm";
import { QuestionRow } from "./QuestionRow";

export default async function QuestionsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: questions } = await supabase
    .from("questions")
    .select("id, text, active, created_at")
    .order("active", { ascending: false })
    .order("created_at", { ascending: false });

  const questionIds = (questions ?? []).map((question) => question.id);
  const [{ data: evidenceRows }, { data: updateRows }] = questionIds.length > 0
    ? await Promise.all([
        supabase.from("question_evidence").select("question_id").in("question_id", questionIds).eq("relevant", true),
        supabase.from("question_updates").select("question_id, created_at").in("question_id", questionIds).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const evidenceCounts = new Map<string, number>();
  for (const row of evidenceRows ?? []) evidenceCounts.set(row.question_id, (evidenceCounts.get(row.question_id) ?? 0) + 1);
  const latestUpdateByQuestion = new Map<string, string>();
  for (const row of updateRows ?? []) {
    if (!latestUpdateByQuestion.has(row.question_id)) latestUpdateByQuestion.set(row.question_id, row.created_at);
  }

  return (
    <main>
      <h1 className="h1-serif">Questions</h1>
      <p className="dek" style={{ maxWidth: 680 }}>
        Track an analytical question over time. World Brief creates a starting assessment from your archive, then logs new evidence and publishes a weekly update.
      </p>
      <QuestionForm />
      {(questions ?? []).map((q) => (
        <QuestionRow
          key={q.id}
          id={q.id}
          text={q.text}
          active={q.active}
          createdAt={q.created_at}
          evidenceCount={evidenceCounts.get(q.id) ?? 0}
          lastUpdatedAt={latestUpdateByQuestion.get(q.id) ?? null}
        />
      ))}
      {(questions ?? []).length === 0 && <p className="empty">No questions yet.</p>}
    </main>
  );
}
