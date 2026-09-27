"use server";

import { revalidatePath } from "next/cache";
import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { embedTexts } from "@dailydigest/llm";

export async function createQuestionAction(formData: FormData): Promise<{ error?: string }> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Bir soru yazmalısın." };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const { models } = await loadWebConfig();

  try {
    const [embedding] = await embedTexts({
      texts: [text],
      embedding: models.embedding,
      prices: models.prices_per_million_tokens,
      apiKeys: { openai: process.env.OPENAI_API_KEY },
      db: supabase,
      ownerId: userData.user.id,
      stage: "create_question_web",
    });

    const { error } = await supabase.from("questions").insert({
      owner_id: userData.user.id,
      text,
      active: true,
      embedding,
    });
    if (error) return { error: error.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bilinmeyen hata" };
  }

  revalidatePath("/questions");
  return {};
}

export async function setQuestionActiveAction(questionId: string, active: boolean): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("questions").update({ active }).eq("id", questionId);
  revalidatePath("/questions");
}
