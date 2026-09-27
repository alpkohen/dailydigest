import { describe, expect, it } from "vitest";
import { validateBrief } from "../lib/briefValidator.js";

describe("validateBrief", () => {
  const base = {
    headline: "Bugün üç önemli gelişme yaşandı. Türkiye AB ile temas kurdu. Suriye'de yeniden yapılanma sürüyor.",
    sections: [{ section: "critical", story_ids: ["a"] }],
    validStoryIds: new Set(["a", "b"]),
    validResearchIds: new Set<string>(),
  };

  it("passes a clean brief", () => {
    expect(validateBrief(base).ok).toBe(true);
  });

  it("flags an em dash", () => {
    const result = validateBrief({ ...base, headline: "Bugün önemli bir gelişme oldu — ve devam ediyor." });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("em/en dash"))).toBe(true);
  });

  it("flags a hype filler opener", () => {
    const result = validateBrief({ ...base, headline: "Günümüzün hızla değişen dünyasında yeni bir gelişme yaşandı." });
    expect(result.ok).toBe(false);
  });

  it("flags a reference to an unknown story id", () => {
    const result = validateBrief({ ...base, sections: [{ section: "critical", story_ids: ["nonexistent"] }] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("unknown id"))).toBe(true);
  });

  it("flags a story id appearing in more than one section", () => {
    const result = validateBrief({
      ...base,
      sections: [
        { section: "critical", story_ids: ["a"] },
        { section: "follow_up", story_ids: ["a"] },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("more than one section"))).toBe(true);
  });

  it("checks research ids against the research set, not the story set", () => {
    const result = validateBrief({
      ...base,
      sections: [{ section: "new_research", story_ids: ["a"] }],
    });
    expect(result.ok).toBe(false);
  });
});
