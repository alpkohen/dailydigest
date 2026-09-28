import { describe, expect, it } from "vitest";
import { resolveRelevanceOutcome } from "../stages/relevance.js";

describe("resolveRelevanceOutcome", () => {
  it("scores the item once any topic clears its threshold, regardless of other failures", () => {
    expect(resolveRelevanceOutcome(true, false)).toBe("scored");
    expect(resolveRelevanceOutcome(true, true)).toBe("scored");
  });

  it("archives as not_relevant only when every call succeeded and none cleared", () => {
    expect(resolveRelevanceOutcome(false, false)).toBe("not_relevant");
  });

  it("defers to a retry instead of archiving when a call failed", () => {
    expect(resolveRelevanceOutcome(false, true)).toBe("retry");
  });
});
