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
      <h1 style={{ fontSize: 20 }}>Ayarlar</h1>
      <SettingsForm
        language={profile?.language ?? "tr"}
        timezone={profile?.timezone ?? "Europe/Istanbul"}
        briefTime={profile?.brief_time?.slice(0, 5) ?? "07:00"}
        quietStart={quietHours.start}
        quietEnd={quietHours.end}
        dailyBudgetUsd={profile?.daily_budget_usd ?? limits.daily_budget_usd}
        interestProfile={profile?.interest_profile ?? ""}
      />

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15 }}>Rol başına modeller</h2>
        <p style={{ fontSize: 12, color: "#888" }}>Bunlar config/models.yaml üzerinden değiştirilir, buradan salt okunur gösterilir.</p>
        <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: 16, color: "#666" }}>fast</td>
              <td>{models.roles.fast.provider} / {models.roles.fast.model}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: 16, color: "#666" }}>mid</td>
              <td>{models.roles.mid.provider} / {models.roles.mid.model}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: 16, color: "#666" }}>strong</td>
              <td>{models.roles.strong.provider} / {models.roles.strong.model}</td>
            </tr>
            <tr>
              <td style={{ paddingRight: 16, color: "#666" }}>embedding</td>
              <td>{models.embedding.provider} / {models.embedding.model}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
