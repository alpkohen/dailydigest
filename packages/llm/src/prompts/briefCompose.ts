import { z } from "zod";

/** SPEC.md section 7: brief_compose | strong | ranked structured stories | headline block, section ordering, final text.
 * The LLM only writes the headline block and orders stories into sections;
 * each story's own summary/why_it_matters/etc text was already written by
 * story_enrich and is assembled verbatim, so this can't fabricate facts or
 * citations, and CLAUDE.md's writing rules (no em dashes, no filler
 * openers) apply directly to the small amount of text it does write. */
export const briefComposeSchema = z.object({
  headline: z.string(),
  sections: z.array(
    z.object({
      section: z.enum(["critical", "follow_up", "worth_reading", "new_research"]),
      story_ids: z.array(z.string()),
    }),
  ),
});
export type BriefComposeResult = z.infer<typeof briefComposeSchema>;

export function buildBriefComposePrompt(params: {
  stories: { id: string; title: string; summary: string; tier: number | null; topicNames: string[] }[];
  researchItems: { id: string; title: string; argument: string }[];
}): string {
  const storiesBlock = params.stories
    .map((s) => `- id: ${s.id}\n  tier: ${s.tier ?? "?"}\n  topics: ${s.topicNames.join(", ")}\n  title: ${s.title}\n  summary: ${s.summary}`)
    .join("\n");
  const researchBlock = params.researchItems.map((r) => `- id: ${r.id}\n  title: ${r.title}\n  argument: ${r.argument}`).join("\n");

  return `Today's candidate stories:
${storiesBlock || "(none)"}

New research items:
${researchBlock || "(none)"}

Write, in Turkish, plain and analytical (no hype, no filler openers like "günümüzün hızla değişen dünyasında", no em dashes, use commas/colons/full stops instead):
- headline: exactly three sentences summarising the day, using only facts present in the summaries above
- sections: assign every story id above to exactly one section: "critical" (tier 1), "follow_up" (tier 2), "worth_reading" (tier 3 but substantive), "new_research" (research item ids). Order story_ids within each section by importance.

Use only the ids given above; never invent a story or research id.

Respond with only a JSON object shaped exactly like this example (keys and structure must match exactly, "section" must be one of the four literal values shown):
{"headline": "...", "sections": [{"section": "critical", "story_ids": ["<id>"]}, {"section": "new_research", "story_ids": ["<id>"]}]}`;
}
