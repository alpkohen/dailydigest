"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actionResult";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function setSourceActiveAction(sourceId: string, active: boolean): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("sources").update({ active }).eq("id", sourceId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/sources");
  return { ok: true };
}

export async function createSourceAction(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not signed in." };

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const language = String(formData.get("language") ?? "").trim() || null;
  const perspectiveGroupId = String(formData.get("perspective_group_id") ?? "").trim() || null;
  const weightRaw = String(formData.get("weight") ?? "0.5");
  const paywalled = formData.get("paywalled") === "on";

  if (!name) return { error: "Name is required." };
  if (!url || !/^https?:\/\//.test(url)) return { error: "Enter a valid feed URL (starting with http:// or https://)." };

  const weight = Number(weightRaw);
  if (Number.isNaN(weight) || weight < 0 || weight > 1) return { error: "Weight must be between 0 and 1." };

  const { error } = await supabase.from("sources").insert({
    owner_id: userData.user.id,
    name,
    type: "rss",
    url_or_query: url,
    language,
    perspective_group_id: perspectiveGroupId,
    weight,
    paywalled,
    active: true,
  });

  if (error) {
    if (error.code === "23505") return { error: "A source with that name already exists." };
    return { error: error.message };
  }

  revalidatePath("/sources");
  return {};
}
