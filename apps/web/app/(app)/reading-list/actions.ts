"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function toggleReadAction(id: string, isRead: boolean): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("reading_list").update({ read_at: isRead ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/reading-list");
}

export async function updateNotesAction(id: string, notes: string, tagsCsv: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const tags = tagsCsv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  await supabase.from("reading_list").update({ notes, tags }).eq("id", id);
  revalidatePath("/reading-list");
}

export async function removeFromReadingListAction(id: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("reading_list").delete().eq("id", id);
  revalidatePath("/reading-list");
}
