import Link from "next/link";
import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { IconArrowRight, IconSpark } from "@/components/icons";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("language, timezone, quiet_hours, daily_budget_usd, interest_profile")
    .eq("owner_id", userData.user?.id ?? "")
    .maybeSingle();

  const quietHours = (profile?.quiet_hours as { start: string; end: string } | null) ?? { start: "23:00", end: "07:00" };
  const { limits } = await loadWebConfig();

  return (
    <main>
      <h1 className="h1-serif">Settings</h1>
      <div style={{ marginTop: 20 }}>
        <SettingsForm
          language={profile?.language ?? "tr"}
          timezone={profile?.timezone ?? "Europe/Istanbul"}
          quietStart={quietHours.start}
          quietEnd={quietHours.end}
          dailyBudgetUsd={profile?.daily_budget_usd ?? limits.daily_budget_usd}
          interestProfile={profile?.interest_profile ?? ""}
        />
      </div>

      <section className="section">
        <h2 className="h2-section">AI</h2>
        <div className="rail-card-v2" style={{ maxWidth: 420 }}>
          <p className="rail-card-desc" style={{ marginBottom: 12 }}>
            See which model wrote what, how many calls the app has made, and what it has cost.
          </p>
          <Link href="/ai-activity" className="rail-card-link">
            <IconSpark />
            View AI Activity
            <IconArrowRight />
          </Link>
        </div>
      </section>
    </main>
  );
}
