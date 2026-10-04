import { describe, expect, it } from "vitest";
import { compileKeywords, matchesKeywords, normalizeText } from "../lib/keywordMatch.js";

describe("normalizeText", () => {
  it("folds Turkish dotted/dotless i and accents", () => {
    expect(normalizeText("İRAN ışık Çin")).toBe("iran isik cin");
  });
});

describe("matchesKeywords", () => {
  const ukraine = compileKeywords(["Ukraine", "Ukrayna", "Zelensky", "Kremlin", "NATO"], []);

  it("matches case-insensitively", () => {
    expect(matchesKeywords(ukraine, "UKRAINE peace talks stall")).toBe(true);
  });

  it("matches Turkish suffixed forms", () => {
    expect(matchesKeywords(ukraine, "Ukrayna'nın enerji altyapısına saldırı")).toBe(true);
    expect(matchesKeywords(ukraine, "Kremlin'den açıklama")).toBe(true);
  });

  it("does not match inside another word", () => {
    const eu = compileKeywords(["AB"], []);
    expect(matchesKeywords(eu, "A story about tariffs")).toBe(false);
    expect(matchesKeywords(eu, "AB ile gümrük birliği")).toBe(true);
  });

  it("matches acronyms only in their case", () => {
    expect(matchesKeywords(ukraine, "NATO summit opens")).toBe(true);
    const un = compileKeywords(["UN"], []);
    expect(matchesKeywords(un, "an unusual day")).toBe(false);
  });

  it("exclusions win over inclusions", () => {
    const withExclusion = compileKeywords(["Ukraine"], ["football"]);
    expect(matchesKeywords(withExclusion, "Ukraine football team qualifies")).toBe(false);
  });

  it("matches nothing when there are no keywords", () => {
    expect(matchesKeywords(compileKeywords([], []), "Ukraine")).toBe(false);
  });
});
