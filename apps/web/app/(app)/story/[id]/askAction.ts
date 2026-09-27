"use server";

import { askSchema, buildAskPrompt, callLlm } from "@dailydigest/llm";
import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** SPEC.md section 4.8: "Ask about this story: chat grounded in the story items plus archive retrieval." MVP grounds in the story's own items only. */
export async function askStoryAction(storyId: string, question: string): Promise<{ answer?: string; error?: string }> {
  if (!question.trim()) return { error: "Bir soru yaz." };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const { data: storyItems } = await supabase
    .from("story_items")
    .select("items(title, standfirst, published_at)")
    .eq("story_id", storyId);

  type Row = { items: { title: string; standfirst: string | null; published_at: string | null } | null };
  const items = ((storyItems ?? []) as unknown as Row[])
    .map((r) => r.items)
    .filter((i): i is NonNullable<Row["items"]> => Boolean(i))
    .map((i, index) => ({ index: index + 1, title: i.title, standfirst: i.standfirst, publishedAt: i.published_at }));

  if (items.length === 0) return { answer: "Bu story için kaynak bulunamadı." };

  const { models } = await loadWebConfig();

  try {
    const result = await callLlm({
      role: "strong",
      promptName: "ask",
      prompt: buildAskPrompt({ question, items }),
      schema: askSchema,
      modelsConfig: models,
      apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY },
      db: supabase,
      ownerId: userData.user.id,
      stage: "ask_story",
      maxTokens: 768,
    });
    return { answer: result.answer };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bilinmeyen hata" };
  }
}
