"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveSettingsAction(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const language = String(formData.get("language") ?? "tr");
  const timezone = String(formData.get("timezone") ?? "Europe/Istanbul");
  const briefTime = String(formData.get("brief_time") ?? "07:00");
  const quietStart = String(formData.get("quiet_start") ?? "23:00");
  const quietEnd = String(formData.get("quiet_end") ?? "07:00");
  const dailyBudget = Number(formData.get("daily_budget_usd") ?? 5);
  const interestProfile = String(formData.get("interest_profile") ?? "").trim() || null;

  const { error } = await supabase.from("profiles").upsert(
    {
      owner_id: userData.user.id,
      language,
      timezone,
      brief_time: briefTime,
      quiet_hours: { start: quietStart, end: quietEnd },
      daily_budget_usd: dailyBudget,
      interest_profile: interestProfile,
    },
    { onConflict: "owner_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return {};
}
