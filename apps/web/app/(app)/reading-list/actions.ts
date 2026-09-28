"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actionResult";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function toggleReadAction(id: string, isRead: boolean): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("reading_list").update({ read_at: isRead ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reading-list");
  return { ok: true };
}

export async function updateNotesAction(id: string, notes: string, tagsCsv: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const tags = tagsCsv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const { error } = await supabase.from("reading_list").update({ notes, tags }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reading-list");
  return { ok: true };
}

export async function removeFromReadingListAction(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("reading_list").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reading-list");
  return { ok: true };
}
