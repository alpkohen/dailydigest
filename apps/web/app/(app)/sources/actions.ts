"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function setSourceActiveAction(sourceId: string, active: boolean): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("sources").update({ active }).eq("id", sourceId);
  revalidatePath("/sources");
}
