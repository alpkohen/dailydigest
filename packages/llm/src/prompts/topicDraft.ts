import { z } from "zod";

/** SPEC.md section 7 prompt inventory: topic_draft | strong | one-sentence topic | description, queries_tr, queries_en, exclusions, suggested sources. */
export const topicDraftSchema = z.object({
  name: z.string(),
  description: z.string(),
  queries_tr: z.array(z.string()).min(1),
  queries_en: z.array(z.string()).min(1),
  exclusions: z.array(z.string()),
  suggested_sources: z.array(z.string()),
});
export type TopicDraft = z.infer<typeof topicDraftSchema>;

export function buildTopicDraftPrompt(sentence: string): string {
  return `The owner runs a personal foreign policy and political science intelligence desk (SPEC.md section 4.1). They described a new topic in one sentence:

"${sentence}"

Draft a structured topic definition as JSON with these exact keys:
- name: a short (2-5 word) label for this topic
- description: 2-3 sentences describing what is in scope and what is explicitly out of scope
- queries_tr: 3-5 Turkish search query strings that would surface relevant coverage
- queries_en: 3-5 English search query strings that would surface relevant coverage
- exclusions: terms or angles to exclude (can be an empty array)
- suggested_sources: names of publications, think tanks or journals likely to cover this topic well (can be an empty array)

Respond with only the JSON object, no other text.`;
}
