"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function saveStoryToReadingListAction(storyId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase.from("feedback").insert({
    owner_id: userData.user.id,
    target_type: "story",
    target_id: storyId,
    signal: "saved",
    context: "app",
  });

  await supabase.from("reading_list").upsert(
    { owner_id: userData.user.id, story_id: storyId },
    { onConflict: "owner_id,story_id", ignoreDuplicates: true },
  );

  revalidatePath("/");
  revalidatePath("/reading-list");
}

export async function saveItemToReadingListAction(itemId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase.from("reading_list").upsert(
    { owner_id: userData.user.id, item_id: itemId },
    { onConflict: "owner_id,item_id", ignoreDuplicates: true },
  );

  revalidatePath("/");
  revalidatePath("/reading-list");
}
