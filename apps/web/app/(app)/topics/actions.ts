"use server";

import { buildTopicDraftPrompt, callLlm, embedTexts, topicDraftSchema } from "@dailydigest/llm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actionResult";
import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * SPEC.md section 4.1: "Create a topic by typing one sentence." Runs the
 * same topic_draft flow as the worker's create_topic CLI stage, but here
 * under the signed-in user's own session (anon key + RLS), never the
 * service role key, per the NFR that it stays worker-only.
 */
export async function createTopicAction(formData: FormData): Promise<{ error?: string }> {
  const sentence = String(formData.get("sentence") ?? "").trim();
  if (!sentence) return { error: "Bir cümle yazmalısın." };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const { models, limits } = await loadWebConfig();

  try {
    const draft = await callLlm({
      role: "strong",
      promptName: "topic_draft",
      prompt: buildTopicDraftPrompt(sentence),
      schema: topicDraftSchema,
      modelsConfig: models,
      apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY },
      db: supabase,
      ownerId: userData.user.id,
      stage: "create_topic_web",
      maxTokens: 1024,
    });

    const [embedding] = await embedTexts({
      texts: [`${draft.name}\n\n${draft.description}`],
      embedding: models.embedding,
      prices: models.prices_per_million_tokens,
      apiKeys: { openai: process.env.OPENAI_API_KEY },
      db: supabase,
      ownerId: userData.user.id,
      stage: "create_topic_web",
    });

    const { error: insertError } = await supabase.from("topics").insert({
      owner_id: userData.user.id,
      name: draft.name,
      description: draft.description,
      queries_tr: draft.queries_tr,
      queries_en: draft.queries_en,
      exclusions: draft.exclusions,
      priority: "normal",
      frequency: "daily",
      alerts_enabled: false,
      languages: ["tr", "en"],
      active: true,
      embedding,
      relevance_threshold: limits.thresholds.relevance_default,
    });
    if (insertError) return { error: insertError.message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bilinmeyen hata" };
  }

  revalidatePath("/topics");
  return {};
}

export async function setTopicActiveAction(topicId: string, active: boolean): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("topics").update({ active }).eq("id", topicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/topics");
  return { ok: true };
}

export async function deleteTopicAction(topicId: string): Promise<ActionResult> {
  // SPEC.md section 4.1: "Delete archives the topic; items stay in the archive."
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("topics").update({ active: false }).eq("id", topicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/topics");
  return { ok: true };
}
