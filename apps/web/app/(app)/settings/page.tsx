import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("language, timezone, brief_time, quiet_hours, daily_budget_usd, interest_profile")
    .eq("owner_id", userData.user?.id ?? "")
    .maybeSingle();

  const quietHours = (profile?.quiet_hours as { start: string; end: string } | null) ?? { start: "23:00", end: "07:00" };
  const { models, limits } = await loadWebConfig();

  return (
    <main>
      <h1 className="h1-serif">Settings</h1>
      <div style={{ marginTop: 20 }}>
        <SettingsForm
          language={profile?.language ?? "tr"}
          timezone={profile?.timezone ?? "Europe/Istanbul"}
          briefTime={profile?.brief_time?.slice(0, 5) ?? "07:00"}
          quietStart={quietHours.start}
          quietEnd={quietHours.end}
          dailyBudgetUsd={profile?.daily_budget_usd ?? limits.daily_budget_usd}
          interestProfile={profile?.interest_profile ?? ""}
        />
      </div>

      <section className="section">
        <h2 className="h2-section">Models per role</h2>
        <p className="row-meta" style={{ margin: "0 0 12px" }}>Set via config/models.yaml; shown here read-only.</p>
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
    </main>
  );
}
