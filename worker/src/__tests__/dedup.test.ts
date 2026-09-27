import { describe, expect, it } from "vitest";
import { cosineSimilarity, findCanonicalMatch, type DedupCandidate } from "../lib/dedup.js";

const HOUR = 60 * 60 * 1000;
const WINDOW = 48 * HOUR;

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
});

describe("findCanonicalMatch", () => {
  const canonical: DedupCandidate = {
    id: "canonical",
    publishedAt: Date.parse("2026-09-27T08:00:00Z"),
    simhash: "12345",
    embedding: [1, 0, 0],
  };

  it("links a near-duplicate simhash within the time window to the canonical item", () => {
    const duplicate: DedupCandidate = {
      id: "dup",
      publishedAt: Date.parse("2026-09-27T09:00:00Z"),
      simhash: "12349", // hamming distance small
      embedding: [0, 1, 0], // deliberately dissimilar, simhash alone should match
    };
    const result = findCanonicalMatch(duplicate, [canonical], WINDOW, 8, 0.95);
    expect(result).toBe("canonical");
  });

  it("links via embedding cosine similarity even with a very different simhash", () => {
    const duplicate: DedupCandidate = {
      id: "dup",
      publishedAt: Date.parse("2026-09-27T09:00:00Z"),
      simhash: "-9999999999999999999",
      embedding: [1, 0.001, 0],
    };
    const result = findCanonicalMatch(duplicate, [canonical], WINDOW, 8, 0.95);
    expect(result).toBe("canonical");
  });

  it("does not link items outside the time window", () => {
    const farApart: DedupCandidate = {
      id: "far",
      publishedAt: Date.parse("2026-09-30T08:00:00Z"),
      simhash: "12345",
      embedding: [1, 0, 0],
    };
    expect(findCanonicalMatch(farApart, [canonical], WINDOW, 8, 0.95)).toBeNull();
  });

  it("does not link unrelated items", () => {
    const unrelated: DedupCandidate = {
      id: "unrelated",
      publishedAt: Date.parse("2026-09-27T09:00:00Z"),
      simhash: "999999999999",
      embedding: [0, 0, 1],
    };
    expect(findCanonicalMatch(unrelated, [canonical], WINDOW, 8, 0.95)).toBeNull();
  });

  it("picks the earliest-published match when several qualify", () => {
    const earlier: DedupCandidate = { ...canonical, id: "earlier", publishedAt: canonical.publishedAt - HOUR };
    const later: DedupCandidate = { ...canonical, id: "later", publishedAt: canonical.publishedAt + HOUR };
    const duplicate: DedupCandidate = {
      id: "dup",
      publishedAt: canonical.publishedAt + 2 * HOUR,
      simhash: "12345",
      embedding: [1, 0, 0],
    };
    expect(findCanonicalMatch(duplicate, [later, earlier, canonical], WINDOW, 8, 0.95)).toBe("earlier");
  });
});
