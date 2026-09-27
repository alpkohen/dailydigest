import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildQuestionUpdatePrompt, callLlm, questionUpdateSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";

/**
 * SPEC.md section 4.2: "Weekly, the system writes a question update."
 * Deliberately NOT wired into the daily --all pipeline (weekly cron
 * scheduling is M9's job); run standalone via --stage=question_update.
 */
export async function runQuestionUpdateStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "question_update", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: questions, error: questionsError } = await db
    .from("questions")
    .select("id, text")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);
  if (questionsError) throw new Error(`Failed to load questions: ${questionsError.message}`);

  const periodEnd = new Date(date);
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 7);

  let written = 0;
  for (const question of questions ?? []) {
    const { data: evidenceRows } = await db
      .from("question_evidence")
      .select("stance, note, stories(title)")
      .eq("question_id", question.id)
      .gte("created_at", periodStart.toISOString());

    const evidence = ((evidenceRows ?? []) as unknown as { stance: string; note: string; stories: { title: string } | null }[]).map((r) => ({
      stance: r.stance,
      note: r.note,
      storyTitle: r.stories?.title ?? "(story)",
    }));

    try {
      const result = await callLlm({
        role: "strong",
        promptName: "question_update",
        prompt: buildQuestionUpdatePrompt({ questionText: question.text, evidence }),
        schema: questionUpdateSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        runId: run.id,
        stage: "question_update",
        maxTokens: 512,
      });

      await db.from("question_updates").insert({
        owner_id: env.OWNER_ID,
        question_id: question.id,
        period_start: periodStart.toISOString().slice(0, 10),
        period_end: periodEnd.toISOString().slice(0, 10),
        text: result.update,
      });
      written++;
    } catch (err) {
      console.error(`question_update: failed for question ${question.id}: ${(err as Error).message}`);
    }
  }

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "question_update", date, written } })
    .eq("id", run.id);

  console.log(`question_update stage done: ${written} question updates written`);
}
