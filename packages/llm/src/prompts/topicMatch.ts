import { z } from "zod";

/** Keyword list for a topic: drives the deterministic half of matching. */
export const topicKeywordsSchema = z.object({
  keywords: z.array(z.string()).min(1),
});
export type TopicKeywordsResult = z.infer<typeof topicKeywordsSchema>;

export function buildTopicKeywordsPrompt(topic: {
  name: string;
  description: string | null;
  queries: string[];
}): string {
  return `A news-monitoring app tracks this topic:
Name: ${topic.name}
Description: ${topic.description ?? "(none)"}
Search queries: ${topic.queries.join(" | ") || "(none)"}

List the words and short phrases that a headline or summary about this topic would almost certainly contain: key people, places, organisations, acronyms, and the core terms themselves. Give each in English AND in Turkish where they differ (e.g. "Ukraine", "Ukrayna"). Prefer specific terms over generic ones ("Zelensky" yes, "war" no). 15 to 40 entries.

Respond with only a JSON object: {"keywords": ["...", "..."]}`;
}

/**
 * Batched topic matching: one call classifies many items against every
 * topic at once. Recall matters more than precision here (the owner must
 * never miss a relevant article), so the prompt says to include when unsure.
 */
export const topicMatchSchema = z.object({
  matches: z.array(
    z.object({
      i: z.number().int(),
      t: z.array(z.number().int()),
    }),
  ),
});
export type TopicMatchResult = z.infer<typeof topicMatchSchema>;

export function buildTopicMatchPrompt(params: {
  topics: { index: number; name: string; description: string | null }[];
  items: { index: number; title: string; standfirst: string | null }[];
}): string {
  const topicsBlock = params.topics
    .map((t) => `T${t.index}: ${t.name}${t.description ? ` (${t.description})` : ""}`)
    .join("\n");
  const itemsBlock = params.items
    .map((i) => `${i.index}. ${i.title}${i.standfirst ? ` | ${i.standfirst.slice(0, 300)}` : ""}`)
    .join("\n");

  return `Topics:
${topicsBlock}

Articles (title | summary), in any language:
${itemsBlock}

For each article, decide which topics it is about, directly or substantially. When unsure, INCLUDE it: missing a relevant article is much worse than including a borderline one. An article can match several topics. Leave out articles that match no topic.

Respond with only a JSON object: {"matches": [{"i": <article number>, "t": [<topic numbers without the T>]}]}`;
}
