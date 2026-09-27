"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function submitStoryFeedbackAction(storyId: string, signal: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase.from("feedback").insert({
    owner_id: userData.user.id,
    target_type: "story",
    target_id: storyId,
    signal,
    context: "app",
  });
  revalidatePath(`/story/${storyId}`);
}
