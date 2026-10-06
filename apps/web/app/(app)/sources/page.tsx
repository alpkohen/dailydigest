import { loadSourcesSeed } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SourceForm } from "./SourceForm";
import { SourceRow } from "./SourceRow";

export default async function SourcesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, type, weight, health_status, active, last_fetched_at, perspective_groups(name)")
    .order("name");

  const { data: perspectiveGroups } = await supabase.from("perspective_groups").select("id, name").order("name");

  type Row = {
    id: string;
    name: string;
    type: string;
    weight: number;
    health_status: string;
    active: boolean;
    last_fetched_at: string | null;
    perspective_groups: { name: string } | null;
  };
  const rows = (sources ?? []) as unknown as Row[];

  // Every source we want but don't get data from, so a gap is never
  // silent: known exclusions (with reason and option) from the seed file,
  // plus anything in the system that is failing or muted.
  const notCollected = (await loadSourcesSeed().catch(() => null))?.not_collected ?? [];
  const known = new Map(notCollected.map((n) => [n.name, n]));
  const byName = new Map(rows.map((r) => [r.name, r]));
  const FETCHED_TYPES = ["rss", "sitemap", "scrape", "api_openalex"];
  const gaps = [
    ...notCollected.map((n) => {
      const row = byName.get(n.name);
      const status = !row ? "not in system" : !row.active ? "muted" : row.health_status === "ok" ? "ok" : row.health_status;
      return { name: n.name, status, reason: n.reason, option: n.option };
    }),
    ...rows
      .filter((r) => !known.has(r.name) && FETCHED_TYPES.includes(r.type))
      .filter((r) => !r.active || r.health_status !== "ok")
      .map((r) => ({
        name: r.name,
        status: r.active ? r.health_status : "muted",
        reason: !r.active
          ? "Muted on this page."
          : r.health_status === "unknown"
            ? "Not fetched yet."
            : r.health_status === "degraded"
              ? "Recent fetches failed or the feed has gone quiet."
              : "Fetches keep failing.",
        option: !r.active ? "Activate below" : r.last_fetched_at ? `Last data ${new Date(r.last_fetched_at).toLocaleDateString("en-GB")}` : "Check the feed URL",
      })),
  ].filter((g) => g.status !== "ok");

  return (
    <main>
      <h1 className="h1-serif">Sources</h1>

      <section className="section">
        <h2 className="h2-section">Not collected ({gaps.length})</h2>
        <p className="text-faint" style={{ fontSize: 12 }}>
          Sources the app does not get articles from right now, why, and what could close the gap.
        </p>
        {gaps.map((g) => (
          <div key={g.name} className="row-flex">
            <div>
              <span className="row-title" style={{ marginRight: 8 }}>{g.name}</span>
              <span className={`badge ${g.status === "muted" || g.status === "not in system" ? "badge-neutral" : g.status === "degraded" ? "badge-critical" : "badge-danger"}`}>
                {g.status}
              </span>
              <div className="row-summary">{g.reason}</div>
              <div className="row-meta">Option: {g.option}</div>
            </div>
          </div>
        ))}
        {gaps.length === 0 && <p className="empty">Every source is delivering.</p>}
      </section>

      <div style={{ marginTop: 16 }}>
        <SourceForm perspectiveGroups={perspectiveGroups ?? []} />
      </div>
      {rows.map((s) => (
        <SourceRow
          key={s.id}
          id={s.id}
          name={s.name}
          type={s.type}
          weight={s.weight}
          healthStatus={s.health_status}
          perspectiveGroup={s.perspective_groups?.name ?? null}
          active={s.active}
        />
      ))}
    </main>
  );
}
