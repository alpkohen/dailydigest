import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const KIND_LABELS: Record<string, string> = { daily: "Günlük", weekly: "Haftalık", alert: "Alarm" };

export default async function BriefsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: briefs } = await supabase
    .from("briefs")
    .select("id, kind, period_date, status, sent_at")
    .order("period_date", { ascending: false });

  return (
    <main>
      <h1 style={{ fontSize: 20 }}>Brief geçmişi</h1>
      {(briefs ?? []).map((b) => (
        <Link
          key={b.id}
          href={`/briefs/${b.id}`}
          style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0", color: "inherit", textDecoration: "none" }}
        >
          <span style={{ fontSize: 14 }}>
            {b.period_date} · {KIND_LABELS[b.kind] ?? b.kind}
          </span>
          <span style={{ fontSize: 12, color: "#888" }}>{b.status}</span>
        </Link>
      ))}
      {(briefs ?? []).length === 0 && <p style={{ color: "#888", fontSize: 14 }}>Henüz brief yok.</p>}
    </main>
  );
}
