"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actionResult";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function submitStoryFeedbackAction(storyId: string, signal: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const { error: feedbackError } = await supabase.from("feedback").insert({
    owner_id: userData.user.id,
    target_type: "story",
    target_id: storyId,
    signal,
    context: "app",
  });
  if (feedbackError) return { ok: false, error: feedbackError.message };

  // SPEC.md section 4.13: "saved" feedback also lands on the reading
  // list. ignoreDuplicates means re-saving an already-listed story is a
  // no-op instead of overwriting its tags/notes back to empty.
  if (signal === "saved") {
    const { error: readingListError } = await supabase
      .from("reading_list")
      .upsert({ owner_id: userData.user.id, story_id: storyId }, { onConflict: "owner_id,story_id", ignoreDuplicates: true });
    if (readingListError) return { ok: false, error: readingListError.message };
  }

  revalidatePath(`/story/${storyId}`);
  revalidatePath("/reading-list");
  return { ok: true };
}
