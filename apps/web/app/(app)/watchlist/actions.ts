"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createWatchAction(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "person");
  const query = String(formData.get("query") ?? "").trim();
  if (!name) return { error: "Bir isim yazmalısın." };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const { error } = await supabase.from("watches").insert({
    owner_id: userData.user.id,
    name,
    kind,
    identifiers: query ? { query } : {},
    active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/watchlist");
  return {};
}

export async function setWatchActiveAction(watchId: string, active: boolean): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("watches").update({ active }).eq("id", watchId);
  revalidatePath("/watchlist");
}
