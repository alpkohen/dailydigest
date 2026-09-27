import { z } from "zod";

/** SPEC.md section 7: question_evidence | mid | story, question | relevant, stance, note. */
export const questionEvidenceSchema = z.object({
  relevant: z.boolean(),
  stance: z.enum(["supports", "complicates", "neutral"]),
  note: z.string(),
});
export type QuestionEvidenceResult = z.infer<typeof questionEvidenceSchema>;

export function buildQuestionEvidencePrompt(params: { questionText: string; storyTitle: string; storySummary: string }): string {
  return `Analytical question being tracked: ${params.questionText}

Story: ${params.storyTitle}
Summary: ${params.storySummary}

Does this story bear on the question? If so, does it support the premise, complicate it, or provide neutral context? Respond with only a JSON object: {"relevant": <boolean>, "stance": "supports"|"complicates"|"neutral", "note": "<one sentence, present evidence not a verdict>"}. If not relevant, still return valid JSON with relevant: false.`;
}
