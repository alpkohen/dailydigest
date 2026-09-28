import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AiTag } from "@/components/AiTag";

const STANCE_LABELS: Record<string, string> = { supports: "Supports", complicates: "Complicates", neutral: "Neutral context" };

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" };

interface Citation {
  index: number;
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: question } = await supabase.from("questions").select("id, text, active, created_at").eq("id", id).maybeSingle();
  if (!question) notFound();

  const { data: evidenceRows } = await supabase
    .from("question_evidence")
    .select("id, stance, note, created_at, stories(id, title)")
    .eq("question_id", id)
    .eq("relevant", true)
    .order("created_at", { ascending: false });

  const { data: updateRows } = await supabase
    .from("question_updates")
    .select("id, period_start, period_end, text, update_type, citations, created_at")
    .eq("question_id", id)
    .order("period_end", { ascending: false });

  type EvidenceRow = { id: string; stance: string; note: string; created_at: string; stories: { id: string; title: string } | null };
  type UpdateRow = { id: string; period_start: string; period_end: string; text: string; update_type: "initial" | "weekly"; citations: unknown; created_at: string };
  const evidence = (evidenceRows ?? []) as unknown as EvidenceRow[];
  const updates = (updateRows ?? []) as unknown as UpdateRow[];
  const initialAssessment = updates.find((update) => update.update_type === "initial");
  const weeklyUpdates = updates.filter((update) => update.update_type === "weekly");
  const citations = Array.isArray(initialAssessment?.citations)
    ? initialAssessment.citations.filter((citation): citation is Citation => {
        if (!citation || typeof citation !== "object") return false;
        const value = citation as Partial<Citation>;
        if (typeof value.index !== "number" || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.url !== "string") return false;
        try {
          const protocol = new URL(value.url).protocol;
          return protocol === "http:" || protocol === "https:";
        } catch {
          return false;
        }
      })
    : [];

  return (
    <main>
      <h1 className="h1-serif">{question.text}</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <span className={`badge ${question.active ? "badge-accent" : "badge-neutral"}`}>{question.active ? "active" : "inactive"}</span>
        <span className="row-meta" style={{ marginTop: 0 }}>
          Tracking since {new Date(question.created_at).toLocaleDateString("en-GB", DATE_FORMAT)}
        </span>
      </div>

      <section className="section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="h2-section" style={{ marginBottom: 0 }}>Current assessment</h2>
          {initialAssessment && <AiTag />}
        </div>
        {initialAssessment ? (
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="row-meta" style={{ marginTop: 0 }}>
              Based on the archive as of {new Date(initialAssessment.created_at).toLocaleDateString("en-GB", DATE_FORMAT)}
            </div>
            <p className="row-summary" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{initialAssessment.text}</p>
            {citations.length > 0 && (
              <div className="question-citations">
                {citations.map((citation) => (
                  <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer">
                    [{citation.index}] {citation.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="empty">The initial assessment could not be generated. Daily tracking is still active.</p>
        )}
      </section>

      <section className="section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="h2-section" style={{ marginBottom: 0 }}>Weekly updates</h2>
          {weeklyUpdates.length > 0 && <AiTag />}
        </div>
        {weeklyUpdates.map((u) => (
          <div key={u.id} style={{ margin: "14px 0" }}>
            <div className="row-meta">
              {u.period_start} - {u.period_end}
            </div>
            <p className="row-summary" style={{ marginTop: 4 }}>{u.text}</p>
          </div>
        ))}
        {weeklyUpdates.length === 0 && <p className="empty">No weekly updates yet.</p>}
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
