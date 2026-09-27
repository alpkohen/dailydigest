/**
 * SPEC.md section 6, stage 10 "Compose brief": "A validator checks that
 * every story referenced exists and every citation id is real, and scans
 * for banned patterns (em dashes, hype phrases)." CLAUDE.md writing rules:
 * no em dashes, no hype/filler openers.
 */

const BANNED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /—|–/, reason: "em/en dash" },
  { pattern: /günümüzün hızla değişen dünyasında/i, reason: "hype filler opener" },
  { pattern: /içinde bulunduğumuz çağda/i, reason: "hype filler opener" },
  { pattern: /büyük önem taşımaktadır/i, reason: "hype phrase" },
];

export interface BriefValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateBrief(params: {
  headline: string;
  sections: { section: string; story_ids: string[] }[];
  validStoryIds: Set<string>;
  validResearchIds: Set<string>;
}): BriefValidationResult {
  const errors: string[] = [];

  for (const { pattern, reason } of BANNED_PATTERNS) {
    if (pattern.test(params.headline)) errors.push(`headline contains banned pattern: ${reason}`);
  }

  const seen = new Set<string>();
  for (const section of params.sections) {
    const validIds = section.section === "new_research" ? params.validResearchIds : params.validStoryIds;
    for (const id of section.story_ids) {
      if (!validIds.has(id)) errors.push(`section "${section.section}" references unknown id ${id}`);
      if (seen.has(id)) errors.push(`id ${id} appears in more than one section`);
      seen.add(id);
    }
  }

  return { ok: errors.length === 0, errors };
}
