"use server";

import { buildTopicDraftPrompt, callLlm, embedTexts, topicDraftSchema } from "@dailydigest/llm";
import { assertPublicHttpUrl } from "@dailydigest/db";
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

/**
 * Layer 2: adds a checked suggestion as a followed source. Only suggestions
 * whose feed or sitemap the worker found and read can be added.
 */
export async function addSuggestedSourceAction(suggestionId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in." };

  const { data: s, error } = await supabase
    .from("topic_source_suggestions")
    .select("id, topic_id, name, language, source_type, feed_url, status")
    .eq("id", suggestionId)
    .maybeSingle();
  if (error || !s) return { ok: false, error: error?.message ?? "Suggestion not found." };
  if (!s.feed_url || !s.source_type || (s.status !== "ok" && s.status !== "stale")) {
    return { ok: false, error: "No working feed was found for this source." };
  }
  try {
    await assertPublicHttpUrl(s.feed_url);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const { error: insertError } = await supabase.from("sources").insert({
    owner_id: userData.user.id,
    name: s.name,
    type: s.source_type,
    url_or_query: s.feed_url,
    language: s.language,
    weight: 0.6,
    active: true,
  });
  if (insertError && insertError.code !== "23505") return { ok: false, error: insertError.message };

  await supabase.from("topic_source_suggestions").update({ status: "added" }).eq("id", s.id);
  revalidatePath(`/topics/${s.topic_id}`);
  revalidatePath("/sources");
  return { ok: true };
}

export async function dismissSuggestionAction(suggestionId: string, topicId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("topic_source_suggestions").update({ status: "dismissed" }).eq("id", suggestionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/topics/${topicId}`);
  return { ok: true };
}

/** Queues the topic for another suggestion round on the next collect run. */
export async function requestMoreSourcesAction(topicId: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("topics").update({ sources_suggested_at: null }).eq("id", topicId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/topics/${topicId}`);
  return { ok: true };
}
