import { z } from "zod";

/** SPEC.md section 7 prompt inventory: relevance | fast | item, topic definition, few-shot feedback examples | score, reason. */
export const relevanceSchema = z.object({
  score: z.number().min(0).max(10),
  reason: z.string(),
});
export type RelevanceResult = z.infer<typeof relevanceSchema>;

/**
 * Batched variant: scores many items against one topic in a single call.
 * Topic context (description, exclusions, few-shot examples) is identical
 * for every item in a topic, so one call per batch instead of one call per
 * item amortizes that fixed context instead of repeating it - fewer, larger
 * calls instead of many small ones (relevance was observed live taking
 * 45-60 minutes/day at one item/topic-pair per call).
 */
export const relevanceBatchSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      score: z.number().min(0).max(10),
      reason: z.string(),
    }),
  ),
});
export type RelevanceBatchResult = z.infer<typeof relevanceBatchSchema>;

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

export function buildRelevanceBatchPrompt(params: {
  items: { id: string; title: string; standfirst: string | null; language: string | null }[];
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

  const itemsBlock = params.items
    .map((item) => `- id: ${item.id}\n  language: ${item.language ?? "unknown"}\n  title: ${item.title}\n  standfirst: ${item.standfirst ?? "(none)"}`)
    .join("\n");

  return `Topic: ${params.topicName}
Topic description: ${params.topicDescription ?? "(none)"}
Excluded angles: ${params.topicExclusions.length > 0 ? params.topicExclusions.join(", ") : "(none)"}
${fewShot}
Items to score:
${itemsBlock}

Score how relevant EACH item above is to the topic, 0 (not relevant) to 10 (central to the topic). Respect the exclusions and weigh the owner's past feedback above. Score every item independently of the others. Respond with only a JSON object shaped exactly like this, with exactly one entry per item id listed above: {"results": [{"id": "<id>", "score": <number>, "reason": "<one sentence>"}]}.`;
}
