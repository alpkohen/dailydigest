import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const KIND_LABELS: Record<string, string> = { daily: "Daily", weekly: "Weekly", alert: "Alert" };
const STATUS_LABELS: Record<string, string> = { sent: "Sent", ready: "Ready", draft: "Draft", failed: "Failed" };

const STATUS_BADGES: Record<string, string> = {
  sent: "badge-accent",
  ready: "badge-violet",
  draft: "badge-neutral",
  failed: "badge-danger",
};

function briefDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

function sentDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

export default async function BriefsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: briefs } = await supabase
    .from("briefs")
    .select("id, kind, period_date, status, sent_at")
    .order("period_date", { ascending: false });

  const briefRows = briefs ?? [];
  const sentCount = briefRows.filter((brief) => brief.status === "sent").length;
  const latestBrief = briefRows[0] ?? null;

  return (
    <main>
      <div className="brief-history-heading">
        <div>
          <p className="eyebrow">Your archive</p>
          <h1 className="h1-serif">Brief history</h1>
          <p className="dek">Every brief, saved in one place for revisiting and comparison.</p>
        </div>
        <div className="brief-history-total">
          <span className="brief-history-total-number">{briefRows.length}</span>
          <span className="brief-history-total-label">briefs</span>
        </div>
      </div>

      {briefRows.length > 0 && (
        <div className="brief-history-stats">
          <div className="brief-history-stat">
            <span className="brief-history-stat-label">Latest brief</span>
            <span className="brief-history-stat-value">{latestBrief ? briefDate(latestBrief.period_date) : "-"}</span>
          </div>
          <div className="brief-history-stat">
            <span className="brief-history-stat-label">Delivered</span>
            <span className="brief-history-stat-value">{sentCount}</span>
          </div>
          <div className="brief-history-stat">
            <span className="brief-history-stat-label">Formats</span>
            <span className="brief-history-stat-value">Daily, weekly, alerts</span>
          </div>
        </div>
      )}

      <div className="brief-history-list">
        {briefRows.map((b) => (
          <Link key={b.id} href={`/briefs/${b.id}`} className="brief-history-card">
            <div className="brief-history-date">
              <span>{briefDate(b.period_date)}</span>
              <span className="brief-history-kind">{KIND_LABELS[b.kind] ?? b.kind}</span>
            </div>
            <div className="brief-history-card-copy">
              <span className="brief-history-card-title">{KIND_LABELS[b.kind] ?? b.kind} brief</span>
              <span className="brief-history-card-meta">
                {b.sent_at ? `Delivered ${sentDate(b.sent_at)}` : "Not delivered yet"}
              </span>
            </div>
            <div className="brief-history-card-end">
              <span className={`badge ${STATUS_BADGES[b.status] ?? "badge-neutral"}`}>
                {STATUS_LABELS[b.status] ?? b.status}
              </span>
              <span className="brief-history-arrow" aria-hidden="true">→</span>
            </div>
          </Link>
        ))}
      </div>
      {briefRows.length === 0 && (
        <div className="brief-history-empty panel">
          <div className="brief-history-empty-mark">✦</div>
          <h2 className="h2-section">Your archive starts here</h2>
          <p className="empty">Once the first brief is prepared, it will appear here with its delivery status and date.</p>
          <Link href="/" className="btn btn-primary">Open today&apos;s desk</Link>
        </div>
      )}
    </main>
  );
}
