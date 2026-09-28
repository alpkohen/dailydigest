import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildQuestionEvidencePrompt, callLlm, questionEvidenceSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";
import { runPool } from "../lib/pool.js";

const CONCURRENCY = 8;

/**
 * SPEC.md section 4.2 / section 6: each run, stories are tested for
 * relevance to each active question. Every verdict is stored, including
 * irrelevant pairs, so a question/story pair is scored only once.
 */
export async function runQuestionEvidenceStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "question_evidence", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: questions, error: questionsError } = await db
    .from("questions")
    .select("id, text")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);
  if (questionsError) throw new Error(`Failed to load questions: ${questionsError.message}`);

  if (!questions || questions.length === 0) {
    console.log("question_evidence stage: no active questions yet");
    await db
      .from("pipeline_runs")
      .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "question_evidence", date, checked: 0, logged: 0, failed: 0 } })
      .eq("id", run.id);
    return;
  }

  const { data: stories, error: storiesError } = await db
    .from("stories")
    .select("id, title, summary")
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "open")
    .not("summary", "is", null);
  if (storiesError) throw new Error(`Failed to load stories: ${storiesError.message}`);

  const pairs = (questions).flatMap((q) => (stories ?? []).map((s) => ({ question: q, story: s })));

  let checked = 0;
  let logged = 0;
  let failed = 0;
  await runPool(pairs, CONCURRENCY, async ({ question, story }) => {
    const { data: existing } = await db
      .from("question_evidence")
      .select("id")
      .eq("question_id", question.id)
      .eq("story_id", story.id)
      .maybeSingle();
    if (existing) return;

    try {
      const result = await callLlm({
        role: "mid",
        promptName: "question_evidence",
        prompt: buildQuestionEvidencePrompt({ questionText: question.text, storyTitle: story.title, storySummary: story.summary ?? "" }),
        schema: questionEvidenceSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        runId: run.id,
        stage: "question_evidence",
        maxTokens: 256,
      });

      const { error: insertError } = await db.from("question_evidence").insert({
        owner_id: env.OWNER_ID,
        question_id: question.id,
        story_id: story.id,
        relevant: result.relevant,
        stance: result.relevant ? result.stance : null,
        note: result.relevant ? result.note : null,
      });
      if (insertError) throw new Error(insertError.message);

      checked++;
      if (result.relevant) logged++;
    } catch (err) {
      failed++;
      console.error(`question_evidence: failed for question ${question.id}, story ${story.id}: ${(err as Error).message}`);
    }
  });

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: failed > 0 ? "partial" : "ok", stats: { stage: "question_evidence", date, checked, logged, failed } })
    .eq("id", run.id);

  console.log(`question_evidence stage done: ${checked} pairs checked, ${logged} relevant, ${failed} failed`);
}
