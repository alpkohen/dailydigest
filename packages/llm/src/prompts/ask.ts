import { z } from "zod";

/** SPEC.md section 7: ask | strong | question, retrieved items | answer with citations. */
export const askSchema = z.object({
  answer: z.string(),
  citation_indices: z.array(z.number()),
  has_evidence: z.boolean(),
});
export type AskResult = z.infer<typeof askSchema>;

export function buildAskPrompt(params: {
  question: string;
  items: { index: number; title: string; standfirst: string | null; publishedAt: string | null }[];
}): string {
  const itemsBlock = params.items
    .map((i) => `[${i.index}] (${i.publishedAt ?? "tarih bilinmiyor"}) ${i.title}${i.standfirst ? ` — ${i.standfirst}` : ""}`)
    .join("\n");

  return `Archive items retrieved for this question:
${itemsBlock || "(no items retrieved)"}

Question: ${params.question}

Answer ONLY using facts present in the items above (SPEC.md section 4.11: "answered only from stored items"). Cite every factual claim inline using its bracketed number, e.g. "... oldu [2]." If the items above do not contain enough evidence to answer, say so explicitly in Turkish rather than guessing.

Respond with only a JSON object: {"answer": "<Turkish answer with inline [n] citations>", "citation_indices": [<the item numbers actually cited>], "has_evidence": <boolean>}.`;
}
