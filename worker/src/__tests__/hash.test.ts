import { describe, expect, it } from "vitest";
import { computeSimhash, hammingDistance, textHash, weightedSimhashInput } from "../lib/hash.js";

describe("textHash", () => {
  it("is deterministic", () => {
    expect(textHash("hello world")).toBe(textHash("hello world"));
  });

  it("differs for different text", () => {
    expect(textHash("hello world")).not.toBe(textHash("hello there"));
  });
});

describe("computeSimhash + hammingDistance", () => {
  const wireStory =
    "Turkey and Greece agreed on Tuesday to resume exploratory talks over maritime boundaries in the Aegean Sea after months of tension.";
  const republished =
    "Turkey and Greece agreed on Tuesday to resume exploratory talks over maritime boundaries in the Aegean, after months of tension between the two countries.";
  const unrelated =
    "The central bank raised interest rates by fifty basis points, citing persistent inflation pressure in the housing sector.";

  it("is deterministic", () => {
    expect(computeSimhash(wireStory)).toBe(computeSimhash(wireStory));
  });

  it("puts near-identical wire copy much closer than unrelated text", () => {
    const nearDuplicateDistance = hammingDistance(
      computeSimhash(wireStory),
      computeSimhash(republished),
    );
    const unrelatedDistance = hammingDistance(computeSimhash(wireStory), computeSimhash(unrelated));

    expect(nearDuplicateDistance).toBeLessThan(unrelatedDistance);
    // Well under 32 (half of 64 bits, the "no better than random" boundary).
    expect(nearDuplicateDistance).toBeLessThan(24);
  });

  it("hammingDistance of a hash with itself is 0", () => {
    const h = computeSimhash(wireStory);
    expect(hammingDistance(h, h)).toBe(0);
  });
});

describe("weightedSimhashInput", () => {
  // A realistic single-pass boilerplate block (not literally repeated
  // sentences, which would be an unrealistically extreme edge case) —
  // modelled on a real extraction failure this fix was written for: a
  // site's cookie/privacy notice returned instead of the article body.
  const boilerplate =
    "This site uses cookies to improve your experience and analyze traffic. By continuing to browse you accept our privacy " +
    "policy and terms of service. Subscribe to our newsletter for daily updates on politics, economy and world affairs. " +
    "Your personal data is processed in accordance with applicable data protection regulations and may be shared with " +
    "our advertising partners unless you opt out through your account settings page at any time before your next visit.";

  it("does not false-match unrelated articles that share identical extraction boilerplate", () => {
    const a = computeSimhash(weightedSimhashInput("Turkey and Greece resume Aegean talks", boilerplate));
    const b = computeSimhash(weightedSimhashInput("Local election results announced in Ankara", boilerplate));
    expect(hammingDistance(a, b)).toBeGreaterThan(3);
  });

  it("still matches genuine wire-copy duplicates that share both title and body", () => {
    const a = computeSimhash(weightedSimhashInput("Central bank raises rates by 50bps", "The central bank raised interest rates today citing inflation."));
    const b = computeSimhash(weightedSimhashInput("Central bank raises rates by 50bps", "The central bank raised interest rates today, citing inflation."));
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(8);
  });
});
