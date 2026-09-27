import { describe, expect, it } from "vitest";
import { decideCluster, updateCentroid, type StoryCandidate } from "../lib/cluster.js";

const HOUR = 60 * 60 * 1000;
const WINDOW = 72 * HOUR;
const now = Date.parse("2026-09-27T10:00:00Z");

describe("decideCluster", () => {
  const story: StoryCandidate = { id: "story-1", centroid: [1, 0, 0], lastUpdatedAt: now };

  it("attaches directly above the high threshold", () => {
    const decision = decideCluster([0.99, 0.01, 0], now, [story], WINDOW, 0.9, 0.75);
    expect(decision).toMatchObject({ action: "attach", storyId: "story-1" });
  });

  it("asks for LLM confirmation between the thresholds", () => {
    const decision = decideCluster([0.8, 0.6, 0], now, [story], WINDOW, 0.9, 0.75);
    expect(decision).toMatchObject({ action: "confirm", storyId: "story-1" });
  });

  it("starts a new story below the low threshold", () => {
    const decision = decideCluster([0, 1, 0], now, [story], WINDOW, 0.9, 0.75);
    expect(decision).toEqual({ action: "new" });
  });

  it("starts a new story when no candidates are within the time window", () => {
    const farStory: StoryCandidate = { ...story, lastUpdatedAt: now - 10 * 24 * HOUR };
    const decision = decideCluster([1, 0, 0], now, [farStory], WINDOW, 0.9, 0.75);
    expect(decision).toEqual({ action: "new" });
  });

  it("picks the best-matching story when several qualify", () => {
    const weaker: StoryCandidate = { id: "weaker", centroid: [0.8, 0.2, 0], lastUpdatedAt: now };
    const stronger: StoryCandidate = { id: "stronger", centroid: [0.99, 0.01, 0], lastUpdatedAt: now };
    const decision = decideCluster([1, 0, 0], now, [weaker, stronger], WINDOW, 0.9, 0.75);
    expect(decision).toMatchObject({ storyId: "stronger" });
  });
});

describe("updateCentroid", () => {
  it("averages in a new embedding", () => {
    expect(updateCentroid([0, 0], 1, [2, 4])).toEqual([1, 2]);
  });

  it("weights by existing item count", () => {
    expect(updateCentroid([3, 0], 2, [0, 0])).toEqual([2, 0]);
  });
});
