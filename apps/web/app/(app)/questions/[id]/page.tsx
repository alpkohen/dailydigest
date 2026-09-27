import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AiTag } from "@/components/AiTag";

const STANCE_LABELS: Record<string, string> = { supports: "Supports", complicates: "Complicates", neutral: "Neutral context" };

export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: question } = await supabase.from("questions").select("id, text, active").eq("id", id).maybeSingle();
  if (!question) notFound();

  const { data: evidenceRows } = await supabase
    .from("question_evidence")
    .select("id, stance, note, created_at, stories(id, title)")
    .eq("question_id", id)
    .order("created_at", { ascending: false });

  const { data: updateRows } = await supabase
    .from("question_updates")
    .select("id, period_start, period_end, text")
    .eq("question_id", id)
    .order("period_end", { ascending: false });

  type EvidenceRow = { id: string; stance: string; note: string; created_at: string; stories: { id: string; title: string } | null };
  const evidence = (evidenceRows ?? []) as unknown as EvidenceRow[];

  return (
    <main>
      <h1 className="h1-serif">{question.text}</h1>
      <span className={`badge ${question.active ? "badge-accent" : "badge-neutral"}`}>{question.active ? "active" : "inactive"}</span>

      <section className="section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="h2-section" style={{ marginBottom: 0 }}>Weekly updates</h2>
          {(updateRows ?? []).length > 0 && <AiTag />}
        </div>
        {(updateRows ?? []).map((u) => (
          <div key={u.id} style={{ margin: "14px 0" }}>
            <div className="row-meta">
              {u.period_start} — {u.period_end}
            </div>
            <p className="row-summary" style={{ marginTop: 4 }}>{u.text}</p>
          </div>
        ))}
        {(updateRows ?? []).length === 0 && <p className="empty">No weekly updates yet.</p>}
      </section>

      <section className="section">
        <h2 className="h2-section">Evidence log ({evidence.length})</h2>
        {evidence.map((e) => (
          <div key={e.id} className="row-flex" style={{ display: "block" }}>
            <div className="row-meta">
              {STANCE_LABELS[e.stance] ?? e.stance} · {new Date(e.created_at).toLocaleDateString("en-GB")}
            </div>
            <p className="row-summary" style={{ marginTop: 4 }}>{e.note}</p>
            {e.stories && (
              <Link href={`/story/${e.stories.id}`} className="text-accent" style={{ fontSize: 12, textDecoration: "none" }}>
                {e.stories.title}
              </Link>
            )}
          </div>
        ))}
        {evidence.length === 0 && <p className="empty">No evidence yet.</p>}
      </section>
    </main>
  );
}
