import { z } from "zod";

/** SPEC.md section 7: question_update | strong | week's evidence log | update text with confidence language. */
export const questionUpdateSchema = z.object({
  update: z.string(),
});
export type QuestionUpdateResult = z.infer<typeof questionUpdateSchema>;

export function buildQuestionUpdatePrompt(params: {
  questionText: string;
  evidence: { stance: string; note: string; storyTitle: string }[];
}): string {
  const evidenceBlock = params.evidence.map((e) => `- [${e.stance}] ${e.storyTitle}: ${e.note}`).join("\n");

  return `Analytical question: ${params.questionText}

This week's evidence log:
${evidenceBlock || "(no new evidence this week)"}

Write, in Turkish, a weekly update: what new evidence arrived, how the picture shifted, what remains unknown. Present the evidence, do not deliver a verdict. Use explicit confidence language ("sınırlı kanıt var", "birden fazla bağımsız kaynak gösteriyor ki", vb.) rather than asserting conclusions as fact. 2-4 sentences. Respond with only a JSON object: {"update": "<text>"}.`;
}
