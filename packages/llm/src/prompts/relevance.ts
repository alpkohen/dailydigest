import { z } from "zod";

/** SPEC.md section 7 prompt inventory: relevance | fast | item, topic definition, few-shot feedback examples | score, reason.
 * Few-shot feedback injection is a M6 feature (SPEC.md section 4.14) layered on later; M2 scores from the topic definition alone. */
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
}): string {
  return `Topic: ${params.topicName}
Topic description: ${params.topicDescription ?? "(none)"}
Excluded angles: ${params.topicExclusions.length > 0 ? params.topicExclusions.join(", ") : "(none)"}

Item title (${params.itemLanguage ?? "unknown language"}): ${params.itemTitle}
Item standfirst: ${params.itemStandfirst ?? "(none)"}

Score how relevant this item is to the topic, 0 (not relevant) to 10 (central to the topic). Respect the exclusions. Respond with only a JSON object: {"score": <number>, "reason": "<one sentence>"}.`;
}
