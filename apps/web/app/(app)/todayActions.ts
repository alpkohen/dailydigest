"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actionResult";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveStoryToReadingListAction(storyId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const { error: feedbackError } = await supabase.from("feedback").insert({
    owner_id: userData.user.id,
    target_type: "story",
    target_id: storyId,
    signal: "saved",
    context: "app",
  });
  if (feedbackError) return { ok: false, error: feedbackError.message };

  const { error: readingListError } = await supabase
    .from("reading_list")
    .upsert({ owner_id: userData.user.id, story_id: storyId }, { onConflict: "owner_id,story_id", ignoreDuplicates: true });
  if (readingListError) return { ok: false, error: readingListError.message };

  revalidatePath("/");
  revalidatePath("/reading-list");
  return { ok: true };
}

export async function saveItemToReadingListAction(itemId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("reading_list")
    .upsert({ owner_id: userData.user.id, item_id: itemId }, { onConflict: "owner_id,item_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  revalidatePath("/reading-list");
  return { ok: true };
}
