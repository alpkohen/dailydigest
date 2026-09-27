import { z } from "zod";

/** SPEC.md section 7 prompt inventory: relevance | fast | item, topic definition, few-shot feedback examples | score, reason. */
export const relevanceSchema = z.object({
  score: z.number().min(0).max(10),
  reason: z.string(),
});
export type RelevanceResult = z.infer<typeof relevanceSchema>;

export function buildRelevancePrompt(params: {
  itemTitle: string;
  itemStandfirst: string | null;
  itemLanguage: string | null;
  topicName: string;
  topicDescription: string | null;
  topicExclusions: string[];
  positiveExamples?: string[];
  negativeExamples?: string[];
}): string {
  const fewShot =
    (params.positiveExamples?.length || params.negativeExamples?.length)
      ? `\nThe owner has given feedback on past items for this topic (SPEC.md section 4.14):\nMarked relevant: ${
          params.positiveExamples?.length ? params.positiveExamples.map((t) => `"${t}"`).join(", ") : "(none)"
        }\nMarked not relevant / less like this: ${
          params.negativeExamples?.length ? params.negativeExamples.map((t) => `"${t}"`).join(", ") : "(none)"
        }\n`
      : "";

  return `Topic: ${params.topicName}
Topic description: ${params.topicDescription ?? "(none)"}
Excluded angles: ${params.topicExclusions.length > 0 ? params.topicExclusions.join(", ") : "(none)"}
${fewShot}
Item title (${params.itemLanguage ?? "unknown language"}): ${params.itemTitle}
Item standfirst: ${params.itemStandfirst ?? "(none)"}

Score how relevant this item is to the topic, 0 (not relevant) to 10 (central to the topic). Respect the exclusions and weigh the owner's past feedback above. Respond with only a JSON object: {"score": <number>, "reason": "<one sentence>"}.`;
}
