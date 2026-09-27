import { z } from "zod";

/** SPEC.md section 7 prompt inventory: same_story | mid | item, story summary and sample items | same: bool, confidence. */
export const sameStorySchema = z.object({
  same: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
});
export type SameStoryResult = z.infer<typeof sameStorySchema>;

export function buildSameStoryPrompt(params: {
  storyTitle: string;
  sampleItemTitles: string[];
  candidateTitle: string;
  candidateStandfirst: string | null;
}): string {
  return `Existing story: ${params.storyTitle}
Sample coverage so far: ${params.sampleItemTitles.map((t) => `- ${t}`).join("\n")}

Candidate new item:
Title: ${params.candidateTitle}
Standfirst: ${params.candidateStandfirst ?? "(none)"}

Is the candidate item about the SAME specific development as the existing story (not just the same general subject)? Respond with only a JSON object: {"same": <boolean>, "confidence": "low"|"medium"|"high"}.`;
}
