import { notFound } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const STANCE_LABELS: Record<string, string> = { supports: "Destekliyor", complicates: "Karmaşıklaştırıyor", neutral: "Nötr bağlam" };

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
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>{question.text}</h1>
      <p style={{ fontSize: 12, color: "#888" }}>{question.active ? "aktif" : "pasif"}</p>

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 14 }}>Haftalık güncellemeler</h2>
        {(updateRows ?? []).map((u) => (
          <div key={u.id} style={{ margin: "10px 0" }}>
            <div style={{ fontSize: 11, color: "#888" }}>
              {u.period_start} — {u.period_end}
            </div>
            <p style={{ fontSize: 13, lineHeight: "20px" }}>{u.text}</p>
          </div>
        ))}
        {(updateRows ?? []).length === 0 && <p style={{ color: "#888", fontSize: 13 }}>Henüz haftalık güncelleme yok.</p>}
      </section>

      <section style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: 14 }}>Kanıt günlüğü ({evidence.length})</h2>
        {evidence.map((e) => (
          <div key={e.id} style={{ margin: "8px 0", borderBottom: "1px solid #f0f0f0", paddingBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#888" }}>
              {STANCE_LABELS[e.stance] ?? e.stance} · {new Date(e.created_at).toLocaleDateString("tr-TR")}
            </div>
            <p style={{ fontSize: 13, margin: "2px 0" }}>{e.note}</p>
            {e.stories && (
              <Link href={`/story/${e.stories.id}`} style={{ fontSize: 12, color: "#666" }}>
                {e.stories.title}
              </Link>
            )}
          </div>
        ))}
        {evidence.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>Henüz kanıt yok.</p>}
      </section>
    </main>
  );
}
