import { z } from "zod";

/** SPEC.md section 7: research_summary | fast | paper metadata and abstract | argument, method, relevance. */
export const researchSummarySchema = z.object({
  argument: z.string(),
  method: z.string(),
  relevance: z.string(),
});
export type ResearchSummaryResult = z.infer<typeof researchSummarySchema>;

export function buildResearchSummaryPrompt(params: {
  title: string;
  journal: string | null;
  abstract: string | null;
}): string {
  return `Academic paper:
Title: ${params.title}
Journal: ${params.journal ?? "(unknown)"}
Abstract: ${params.abstract ?? "(no abstract available)"}

In Turkish, plain language, one sentence each:
- argument: the paper's core argument or finding
- method: the method used (if discernible from the abstract, else "belirsiz")
- relevance: why this might matter to someone tracking foreign policy and political science

Respond with only a JSON object matching this shape.`;
}
