import { describe, expect, it } from "vitest";
import { computeSimhash, hammingDistance, textHash } from "../lib/hash.js";

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
