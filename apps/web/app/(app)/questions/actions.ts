"use server";

import { revalidatePath } from "next/cache";
import { consumeRateLimit } from "@dailydigest/db";
import { loadWebConfig } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { askSchema, buildAskPrompt, callLlm, embedTexts } from "@dailydigest/llm";

interface AssessmentCandidate {
  id: string;
  title: string;
  standfirst: string | null;
  url: string;
  published_at: string | null;
}

const CREATE_QUESTION_RATE_LIMIT = { max: 10, windowSeconds: 60 };

export async function createQuestionAction(formData: FormData): Promise<{ error?: string; warning?: string; questionId?: string }> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Bir soru yazmalısın." };

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Oturum bulunamadı." };

  const rateLimit = await consumeRateLimit(
    supabase,
    userData.user.id,
    "create_question",
    CREATE_QUESTION_RATE_LIMIT.max,
    CREATE_QUESTION_RATE_LIMIT.windowSeconds,
  );
  if (!rateLimit.allowed) return { error: "Too many questions - wait a minute and try again." };

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

    const { data: question, error } = await supabase
      .from("questions")
      .insert({ owner_id: userData.user.id, text, active: true, embedding })
      .select("id, created_at")
      .single();
    if (error || !question) return { error: error?.message ?? "Soru kaydedilemedi." };

    try {
      const { data: rows, error: searchError } = await supabase.rpc("search_items", {
        p_owner_id: userData.user.id,
        p_query_embedding: embedding,
        p_query_text: text,
        p_match_count: 15,
      });
      if (searchError) throw new Error(searchError.message);

      const candidates = (rows ?? []) as AssessmentCandidate[];
      let assessment = "Arşivde bu soruya ilişkin güvenilir bir başlangıç değerlendirmesi oluşturmak için henüz yeterli kanıt yok.";
      let citations: { index: number; id: string; title: string; url: string; publishedAt: string | null }[] = [];

      if (candidates.length > 0) {
        const indexed = candidates.map((candidate, index) => ({ index: index + 1, ...candidate }));
        const result = await callLlm({
          role: "strong",
          promptName: "question_initial_assessment",
          prompt: buildAskPrompt({
            question: text,
            items: indexed.map((candidate) => ({
              index: candidate.index,
              title: candidate.title,
              standfirst: candidate.standfirst,
              publishedAt: candidate.published_at,
            })),
          }),
          schema: askSchema,
          modelsConfig: models,
          apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY },
          db: supabase,
          ownerId: userData.user.id,
          stage: "question_initial_assessment",
          maxTokens: 1024,
        });
        assessment = result.answer;
        const cited = new Set(result.has_evidence ? result.citation_indices : []);
        citations = indexed
          .filter((candidate) => cited.has(candidate.index))
          .map((candidate) => ({ index: candidate.index, id: candidate.id, title: candidate.title, url: candidate.url, publishedAt: candidate.published_at }));
      }

      const assessmentDate = question.created_at.slice(0, 10);
      const { error: assessmentError } = await supabase.from("question_updates").insert({
        owner_id: userData.user.id,
        question_id: question.id,
        period_start: assessmentDate,
        period_end: assessmentDate,
        text: assessment,
        update_type: "initial",
        citations,
      });
      if (assessmentError) throw new Error(assessmentError.message);
    } catch (assessmentError) {
      revalidatePath("/questions");
      return {
        questionId: question.id,
        warning: `Soru izlemeye alındı ancak başlangıç değerlendirmesi oluşturulamadı: ${assessmentError instanceof Error ? assessmentError.message : "Bilinmeyen hata"}`,
      };
    }

    revalidatePath("/questions");
    return { questionId: question.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Bilinmeyen hata" };
  }
}

export async function setQuestionActiveAction(questionId: string, active: boolean): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("questions").update({ active }).eq("id", questionId);
  revalidatePath("/questions");
}
