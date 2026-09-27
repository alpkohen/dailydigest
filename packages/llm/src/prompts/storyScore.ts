import { z } from "zod";

/** SPEC.md section 7: story_score | mid | story items, prior related stories | tier, novelty, rationale. */
export const storyScoreSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  novelty: z.enum(["new", "continuation", "repetition"]),
  rationale: z.string(),
});
export type StoryScoreResult = z.infer<typeof storyScoreSchema>;

export function buildStoryScorePrompt(params: {
  itemTitles: string[];
  sourceCount: number;
  isFirstCoverage: boolean;
}): string {
  return `Story coverage (${params.sourceCount} source(s)):
${params.itemTitles.map((t) => `- ${t}`).join("\n")}

${params.isFirstCoverage ? "This is the first time this development has been covered." : "This development has prior coverage already logged."}

Assign:
- tier: 1 (critical, must lead the brief), 2 (follow-up, worth a shorter mention), or 3 (interesting but minor)
- novelty: "new" (a new development), "continuation" (follow-up with new facts), or "repetition" (no new facts beyond prior coverage)
- rationale: one sentence

Respond with only a JSON object matching this shape.`;
}
