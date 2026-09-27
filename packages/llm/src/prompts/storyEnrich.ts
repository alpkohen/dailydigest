import { z } from "zod";

/** SPEC.md section 7: story_enrich | strong | story items, prior stories, perspective groups | summary, what_changed, why_it_matters, watch_next, framing[], entities[]. */
export const storyEnrichSchema = z.object({
  summary: z.string(),
  what_changed: z.string(),
  why_it_matters: z.string(),
  watch_next: z.string(),
  framing: z.array(z.object({ perspective_group: z.string(), summary: z.string() })).default([]),
  entities: z.array(z.string()).default([]),
});
export type StoryEnrichResult = z.infer<typeof storyEnrichSchema>;

export function buildStoryEnrichPrompt(params: {
  items: { title: string; standfirst: string | null; sourceName: string; perspectiveGroup: string | null; language: string | null }[];
}): string {
  const itemsBlock = params.items
    .map(
      (item, i) =>
        `${i + 1}. [${item.sourceName}${item.perspectiveGroup ? `, ${item.perspectiveGroup}` : ""}, ${item.language ?? "?"}] ${item.title}${item.standfirst ? ` — ${item.standfirst}` : ""}`,
    )
    .join("\n");

  return `Coverage of one development, from ${params.items.length} source item(s):

${itemsBlock}

Write, in Turkish, plain and analytical (no hype, no filler openers, no em dashes):
- summary: 2-4 sentences, what happened
- what_changed: what is new since prior coverage (say "ilk kapsamımız" if this is the first time)
- why_it_matters: why this matters for the owner's interests
- watch_next: what to watch for next
- framing: an array of {perspective_group, summary} entries, one per distinct perspective group among the sources above (omit if only one group covered it)
- entities: array of key named entities (people, places, institutions)

Every factual sentence must be traceable to the items above; do not add facts not present in them. Respond with only a JSON object matching this shape.`;
}
