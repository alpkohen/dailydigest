import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadWebConfig } from "@/lib/config";

interface LlmCallRow {
  id: string;
  stage: string | null;
  prompt_name: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  ok: boolean;
  error: string | null;
  created_at: string;
}

function sum(list: LlmCallRow[]) {
  return {
    count: list.length,
    cost: list.reduce((n, c) => n + Number(c.cost_usd), 0),
    failed: list.filter((c) => !c.ok).length,
  };
}

export default async function AiActivityPage() {
  const supabase = await createServerSupabaseClient();
  const { models } = await loadWebConfig();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // PostgREST caps any single select at a server-side max-rows setting
  // (1000 here) regardless of the .limit() passed from the client - a
  // full-system audit found this page silently under-reporting by ~7x
  // (showed 1000 calls / 547 failed when the real 30-day totals were 7710
  // / 2959) because a single query with .limit(5000) still only got the
  // first 1000 rows back. Paginating with .range() until a short page
  // is the only way to get every row.
  const PAGE_SIZE = 1000;
  const calls: LlmCallRow[] = [];
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("llm_calls")
      .select("id, stage, prompt_name, model, input_tokens, output_tokens, cost_usd, latency_ms, ok, error, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    calls.push(...((data ?? []) as LlmCallRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCalls = calls.filter((c) => new Date(c.created_at) >= todayStart);

  const todayStats = sum(todayCalls);
  const periodStats = sum(calls);

  const byStage = new Map<string, { count: number; cost: number }>();
  for (const c of calls) {
    const key = c.stage ?? c.prompt_name;
    const bucket = byStage.get(key) ?? { count: 0, cost: 0 };
    bucket.count += 1;
    bucket.cost += Number(c.cost_usd);
    byStage.set(key, bucket);
  }
  const stageBreakdown = [...byStage.entries()].sort((a, b) => b[1].cost - a[1].cost);

  return (
    <main>
      <h1 className="h1-serif">AI Activity</h1>
      <p className="row-meta" style={{ margin: "8px 0 0", maxWidth: 560 }}>
        Every call this app makes to a language model — what wrote the summaries and answers you read, and what it cost. Roles are configured in config/models.yaml.
      </p>

      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num">{todayStats.count}</div>
          <div className="stat-label">Calls today</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">${todayStats.cost.toFixed(3)}</div>
          <div className="stat-label">Cost today</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">{periodStats.count}</div>
          <div className="stat-label">Calls (30d)</div>
        </div>
        <div className="stat-box">
          <div className="stat-num">${periodStats.cost.toFixed(2)}</div>
          <div className="stat-label">Cost (30d)</div>
        </div>
        {periodStats.failed > 0 && (
          <div className="stat-box">
            <div className="stat-num text-danger">{periodStats.failed}</div>
            <div className="stat-label">Failed (30d)</div>
          </div>
        )}
      </div>

      <section className="section">
        <h2 className="h2-section">Models per role</h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <td className="text-faint">fast</td>
                <td>{models.roles.fast.provider} / {models.roles.fast.model}</td>
              </tr>
              <tr>
                <td className="text-faint">mid</td>
                <td>{models.roles.mid.provider} / {models.roles.mid.model}</td>
              </tr>
              <tr>
                <td className="text-faint">strong</td>
                <td>{models.roles.strong.provider} / {models.roles.strong.model}</td>
              </tr>
              <tr>
                <td className="text-faint">embedding</td>
                <td>{models.embedding.provider} / {models.embedding.model}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="h2-section">By stage (last 30 days)</h2>
        {stageBreakdown.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Calls</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {stageBreakdown.map(([stage, s]) => (
                  <tr key={stage}>
                    <td>{stage}</td>
                    <td>{s.count}</td>
                    <td>${s.cost.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No AI calls recorded yet.</p>
        )}
      </section>

      <section className="section">
        <h2 className="h2-section">Recent calls</h2>
        {calls.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Stage</th>
                  <th>Model</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {calls.slice(0, 50).map((c) => (
                  <tr key={c.id}>
                    <td className="text-faint">{new Date(c.created_at).toLocaleString("en-GB")}</td>
                    <td>{c.stage ?? c.prompt_name}</td>
                    <td className="text-faint">{c.model}</td>
                    <td>{c.input_tokens + c.output_tokens}</td>
                    <td>${Number(c.cost_usd).toFixed(4)}</td>
                    <td>
                      {c.ok ? (
                        <span className="badge badge-accent">ok</span>
                      ) : (
                        <span className="badge badge-danger" title={c.error ?? undefined}>
                          failed{c.error ? `: ${c.error.slice(0, 60)}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No AI calls recorded yet.</p>
        )}
      </section>
    </main>
  );
}
