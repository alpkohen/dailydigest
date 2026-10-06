import { describe, expect, it } from "vitest";
import { combineMatches } from "../stages/match.js";

const hits = new Map([
  ["bahceli", new Map([["tr-eu", ["Recep Tayyip Erdoğan", "Ankara"]]])],
  ["customs", new Map([["tr-eu", ["Gümrük Birliği"]]])],
]);

describe("combineMatches", () => {
  it("lets the AI decide: a keyword hit the AI rejected is dropped", () => {
    const m = combineMatches(hits, new Map([["customs", new Set(["tr-eu"])]]));
    expect(m.has("bahceli")).toBe(false);
    expect(m.get("customs")?.get("tr-eu")).toEqual({ score: 10, reason: "ai; keywords: Gümrük Birliği" });
  });

  it("keeps AI-only matches", () => {
    const m = combineMatches(new Map(), new Map([["x", new Set(["t"])]]));
    expect(m.get("x")?.get("t")).toEqual({ score: 7, reason: "ai" });
  });

  it("falls back to keyword hits when the AI call failed", () => {
    const m = combineMatches(hits, null);
    expect(m.get("bahceli")?.get("tr-eu")?.reason).toBe("keywords (AI unavailable): Recep Tayyip Erdoğan, Ankara");
  });
});
