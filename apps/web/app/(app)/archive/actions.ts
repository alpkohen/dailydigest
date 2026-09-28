"use server";

import { consumeRateLimit } from "@dailydigest/db";
import { askSchema, buildAskPrompt, callLlm, embedTexts } from "@dailydigest/llm";
import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// A leaked link, a buggy client-side loop, or a stray script could otherwise
// run up real Anthropic/OpenAI cost with no backstop - askArchiveAction
// calls an LLM per request so gets the tighter limit; searchArchiveAction
// only embeds the query.
const SEARCH_RATE_LIMIT = { max: 30, windowSeconds: 60 };
const ASK_RATE_LIMIT = { max: 15, windowSeconds: 60 };

export interface SearchResultItem {
  id: string;
  title: string;
  standfirst: string | null;
  url: string;
  language: string | null;
  publishedAt: string | null;
  score: number;
}

/** SPEC.md section 4.11: hybrid search (pgvector + full text) via the search_items RPC. */
export async function searchArchiveAction(query: string): Promise<{ results?: SearchResultItem[]; error?: string }> {
  if (!query.trim()) return { results: [] };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const rateLimit = await consumeRateLimit(supabase, userData.user.id, "archive_search", SEARCH_RATE_LIMIT.max, SEARCH_RATE_LIMIT.windowSeconds);
  if (!rateLimit.allowed) return { error: "Too many searches - wait a minute and try again." };

  const { models } = await loadWebConfig();

  const [queryEmbedding] = await embedTexts({
    texts: [query],
    embedding: models.embedding,
    prices: models.prices_per_million_tokens,
    apiKeys: { openai: process.env.OPENAI_API_KEY },
    db: supabase,
    ownerId: userData.user.id,
    stage: "archive_search",
  });

  const { data, error } = await supabase.rpc("search_items", {
    p_owner_id: userData.user.id,
    p_query_embedding: queryEmbedding,
    p_query_text: query,
    p_match_count: 20,
  });
  if (error) return { error: error.message };

  return {
    results: (data ?? []).map((r: { id: string; title: string; standfirst: string | null; url: string; language: string | null; published_at: string | null; score: number }) => ({
      id: r.id,
      title: r.title,
      standfirst: r.standfirst,
      url: r.url,
      language: r.language,
      publishedAt: r.published_at,
      score: r.score,
    })),
  };
}

/** SPEC.md section 4.11: "Ask the archive." */
export async function askArchiveAction(question: string): Promise<{ answer?: string; citations?: SearchResultItem[]; error?: string }> {
  if (!question.trim()) return { error: "Bir soru yaz." };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const rateLimit = await consumeRateLimit(supabase, userData.user.id, "ask_archive", ASK_RATE_LIMIT.max, ASK_RATE_LIMIT.windowSeconds);
  if (!rateLimit.allowed) return { error: "Too many questions - wait a minute and try again." };

  const { models } = await loadWebConfig();

  const [queryEmbedding] = await embedTexts({
    texts: [question],
    embedding: models.embedding,
    prices: models.prices_per_million_tokens,
    apiKeys: { openai: process.env.OPENAI_API_KEY },
    db: supabase,
    ownerId: userData.user.id,
    stage: "ask_archive",
  });

  const { data: candidates, error: searchError } = await supabase.rpc("search_items", {
    p_owner_id: userData.user.id,
    p_query_embedding: queryEmbedding,
    p_query_text: question,
    p_match_count: 15,
  });
  if (searchError) return { error: searchError.message };
  if (!candidates || candidates.length === 0) {
    return { answer: "Arşivde bu soruyla ilgili yeterli kanıt yok.", citations: [] };
  }

  const indexed = candidates.map((c: SearchResultItem, i: number) => ({ index: i + 1, ...c }));

  const result = await callLlm({
    role: "strong",
    promptName: "ask",
    prompt: buildAskPrompt({
      question,
      items: indexed.map((c: SearchResultItem & { index: number }) => ({
        index: c.index,
        title: c.title,
        standfirst: c.standfirst,
        publishedAt: c.publishedAt,
      })),
    }),
    schema: askSchema,
    modelsConfig: models,
    apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY },
    db: supabase,
    ownerId: userData.user.id,
    stage: "ask_archive",
    maxTokens: 1024,
  });

  const citedIndices = new Set(result.citation_indices);
  const citations = indexed.filter((c: SearchResultItem & { index: number }) => citedIndices.has(c.index));

  const { data: thread } = await supabase.from("ask_threads").insert({ owner_id: userData.user.id, scope: "archive" }).select("id").single();
  if (thread) {
    await supabase.from("ask_messages").insert([
      { owner_id: userData.user.id, thread_id: thread.id, role: "user", content: question },
      { owner_id: userData.user.id, thread_id: thread.id, role: "assistant", content: result.answer, citations: citations.map((c: SearchResultItem) => c.id) },
    ]);
  }

  return { answer: result.answer, citations };
}
