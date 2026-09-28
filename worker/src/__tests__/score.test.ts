import { describe, expect, it } from "vitest";
import { computeRankScore } from "../stages/score.js";

describe("computeRankScore", () => {
  it("weighs tier as the dominant factor", () => {
    const tier1 = computeRankScore({ tier: 1, novelty: "continuation", topicPriority: "normal", avgSourceWeight: 0.5, sourceCount: 1 });
    const tier2 = computeRankScore({ tier: 2, novelty: "continuation", topicPriority: "normal", avgSourceWeight: 0.5, sourceCount: 1 });
    const tier3 = computeRankScore({ tier: 3, novelty: "continuation", topicPriority: "normal", avgSourceWeight: 0.5, sourceCount: 1 });
    expect(tier1).toBeGreaterThan(tier2);
    expect(tier2).toBeGreaterThan(tier3);
  });

  it("rewards new development over continuation over repetition", () => {
    const base = { tier: 2, topicPriority: "normal", avgSourceWeight: 0.5, sourceCount: 1 } as const;
    const fresh = computeRankScore({ ...base, novelty: "new" });
    const continuation = computeRankScore({ ...base, novelty: "continuation" });
    const repetition = computeRankScore({ ...base, novelty: "repetition" });
    expect(fresh).toBeGreaterThan(continuation);
    expect(continuation).toBeGreaterThan(repetition);
  });

  it("rewards high topic priority over normal over low", () => {
    const base = { tier: 2, novelty: "continuation", avgSourceWeight: 0.5, sourceCount: 1 } as const;
    const high = computeRankScore({ ...base, topicPriority: "high" });
    const normal = computeRankScore({ ...base, topicPriority: "normal" });
    const low = computeRankScore({ ...base, topicPriority: "low" });
    expect(high).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(low);
  });

  it("rewards a higher average source weight", () => {
    const base = { tier: 2, novelty: "continuation", topicPriority: "normal", sourceCount: 1 } as const;
    const trusted = computeRankScore({ ...base, avgSourceWeight: 0.9 });
    const untrusted = computeRankScore({ ...base, avgSourceWeight: 0.2 });
    expect(trusted).toBeGreaterThan(untrusted);
  });

  it("still adds source count on top of the other factors", () => {
    const base = { tier: 2, novelty: "continuation", topicPriority: "normal", avgSourceWeight: 0.5 } as const;
    const many = computeRankScore({ ...base, sourceCount: 8 });
    const few = computeRankScore({ ...base, sourceCount: 1 });
    expect(many).toBeGreaterThan(few);
    expect(many - few).toBe(7);
  });

  it("falls back to neutral defaults for unknown/missing inputs", () => {
    const withNulls = computeRankScore({ tier: 2, novelty: "unknown_value", topicPriority: null, avgSourceWeight: null, sourceCount: 1 });
    expect(Number.isFinite(withNulls)).toBe(true);
    expect(withNulls).toBeGreaterThan(0);
  });
});
