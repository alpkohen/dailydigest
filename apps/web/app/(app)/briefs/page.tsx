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
      <h1 className="h1-serif">Brief geçmişi</h1>
      <div className="link-list" style={{ marginTop: 20 }}>
        {(briefs ?? []).map((b) => (
          <Link key={b.id} href={`/briefs/${b.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="row-title" style={{ fontWeight: 400 }}>
              {b.period_date} · {KIND_LABELS[b.kind] ?? b.kind}
            </span>
            <span className="badge badge-neutral">{b.status}</span>
          </Link>
        ))}
      </div>
      {(briefs ?? []).length === 0 && <p className="empty">Henüz brief yok.</p>}
    </main>
  );
}
