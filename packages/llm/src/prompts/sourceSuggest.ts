import { z } from "zod";

/**
 * Topic-driven source suggestions: publications likely to cover a topic
 * that the owner does not follow yet. The worker checks each homepage for a
 * feed or sitemap before showing it, so a wrong guess is dropped, not added.
 */
export const sourceSuggestSchema = z.object({
  sources: z.array(
    z.object({
      name: z.string(),
      homepage: z.string(),
      language: z.string(),
      reason: z.string(),
    }),
  ),
});
export type SourceSuggestResult = z.infer<typeof sourceSuggestSchema>;

export function buildSourceSuggestPrompt(params: {
  topic: { name: string; description: string | null };
  existingSources: string[];
  max: number;
}): string {
  return `A personal foreign policy and political science monitoring app tracks this topic:
Name: ${params.topic.name}
Description: ${params.topic.description ?? "(none)"}

It already follows these sources:
${params.existingSources.join(", ")}

Suggest up to ${params.max} further publications that regularly publish on this topic and are not in the list above: news outlets from the countries and regions involved, specialist think tanks, government or international bodies, and regional media in local languages. Prefer sources with daily or weekly output over occasional ones. Only suggest real publications whose official homepage you are sure of.

For each, give:
- name: the publication's name
- homepage: its official homepage URL (https://...)
- language: ISO 639-1 code of its main language
- reason: one short English sentence on why it covers this topic

Respond with only a JSON object: {"sources": [{"name": "...", "homepage": "...", "language": "..", "reason": "..."}]}`;
}
