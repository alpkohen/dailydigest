import { z } from "zod";

/** SPEC.md section 7: outside_radar | mid | candidate stories not in topics, owner interest profile | pick, reason. */
export const outsideRadarSchema = z.object({
  pick_id: z.string().nullable(),
  reason: z.string(),
});
export type OutsideRadarResult = z.infer<typeof outsideRadarSchema>;

export function buildOutsideRadarPrompt(params: {
  interestProfile: string | null;
  candidates: { id: string; title: string; standfirst: string | null }[];
}): string {
  const candidatesBlock = params.candidates.map((c) => `- id: ${c.id}\n  title: ${c.title}\n  standfirst: ${c.standfirst ?? "(none)"}`).join("\n");

  return `Owner's interest profile: ${params.interestProfile ?? "(not set; use general foreign policy / political science judgement)"}

Items outside the owner's current topics:
${candidatesBlock}

Pick at most ONE item that is genuinely likely to interest this owner despite falling outside their current topics (SPEC.md section 4.7, "Outside your radar"). If none qualify, return pick_id: null. Respond with only a JSON object: {"pick_id": "<id or null>", "reason": "<one sentence, only if pick_id is not null>"}.`;
}
