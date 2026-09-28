import { createServiceRoleClient, type ModelsConfig } from "@dailydigest/db";
import { buildQuestionUpdatePrompt, callLlm, questionUpdateSchema } from "@dailydigest/llm";
import type { Env } from "../env.js";

/**
 * SPEC.md section 4.2: "Weekly, the system writes a question update."
 * This stage is run by the dedicated weekly GitHub Actions workflow.
 */
export async function runQuestionUpdateStage(env: Env, models: ModelsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "weekly", stats: { stage: "question_update", date } })
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
  // Monday through Sunday when the scheduled workflow runs on Sunday.
  periodStart.setDate(periodStart.getDate() - 6);
  // Exclusive upper bound (start of the day after periodEnd) so a rerun
  // for a past date doesn't pull in evidence logged after that date.
  const periodEndExclusive = new Date(periodEnd);
  periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);

  let written = 0;
  let failed = 0;
  for (const question of questions ?? []) {
    const periodStartDate = periodStart.toISOString().slice(0, 10);
    const periodEndDate = periodEnd.toISOString().slice(0, 10);
    const { data: existingUpdates, error: existingError } = await db
      .from("question_updates")
      .select("id")
      .eq("question_id", question.id)
      .eq("update_type", "weekly")
      .eq("period_start", periodStartDate)
      .eq("period_end", periodEndDate)
      .limit(1);
    if (existingError) {
      failed++;
      console.error(`question_update: failed to check existing update for question ${question.id}: ${existingError.message}`);
      continue;
    }
    if ((existingUpdates ?? []).length > 0) continue;

    const { data: evidenceRows, error: evidenceError } = await db
      .from("question_evidence")
      .select("stance, note, stories(title)")
      .eq("question_id", question.id)
      .eq("relevant", true)
      .gte("created_at", periodStart.toISOString())
      .lt("created_at", periodEndExclusive.toISOString());
    if (evidenceError) {
      failed++;
      console.error(`question_update: failed to load evidence for question ${question.id}: ${evidenceError.message}`);
      continue;
    }

    const evidence = ((evidenceRows ?? []) as unknown as { stance: string; note: string; stories: { title: string } | null }[]).map((r) => ({
      stance: r.stance,
      note: r.note,
      storyTitle: r.stories?.title ?? "(story)",
    }));

    try {
      const update = evidence.length === 0
        ? "Bu hafta bu soruyla ilgili yeni kanıt kaydedilmedi. Soru aktif olarak izlenmeye devam ediyor."
        : (await callLlm({
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
          })).update;

      const { error: insertError } = await db.from("question_updates").insert({
        owner_id: env.OWNER_ID,
        question_id: question.id,
        period_start: periodStartDate,
        period_end: periodEndDate,
        text: update,
        update_type: "weekly",
        citations: [],
      });
      if (insertError) throw new Error(insertError.message);
      written++;
    } catch (err) {
      failed++;
      console.error(`question_update: failed for question ${question.id}: ${(err as Error).message}`);
    }
  }

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: failed > 0 ? "partial" : "ok", stats: { stage: "question_update", date, written, failed } })
    .eq("id", run.id);

  console.log(`question_update stage done: ${written} question updates written, ${failed} failed`);
}
