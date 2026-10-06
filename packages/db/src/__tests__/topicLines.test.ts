import { describe, expect, it } from "vitest";
import { buildTopicLines } from "../topicLines.js";

describe("buildTopicLines", () => {
  it("picks each topic's most important event not already shown, and counts its events", () => {
    const lines = buildTopicLines([
      { id: "a", title: "Minor", tier: 3, sourceCount: 9, topics: ["Ukraine"] },
      { id: "b", title: "Ship attack", tier: 1, sourceCount: 23, topics: ["Ukraine", "Black Sea"] },
      { id: "c", title: "Big but tier 2", tier: 2, sourceCount: 40, topics: ["Ukraine"] },
      { id: "d", title: "Port", tier: 2, sourceCount: 3, topics: ["Black Sea"] },
    ]);
    expect(lines).toEqual([
      { topic: "Ukraine", storyId: "b", title: "Ship attack", events: 3 },
      { topic: "Black Sea", storyId: "d", title: "Port", events: 2 },
    ]);
  });
});
