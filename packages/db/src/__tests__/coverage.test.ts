import { describe, expect, it } from "vitest";
import { computeTopicCoverage } from "../coverage.js";

const config = { window_days: 7, min_sources: 3, min_items: 3, contributor_window_days: 30 };
const sources = [
  { id: "s1", name: "BBC", health_status: "ok", active: true },
  { id: "s2", name: "Al-Monitor", health_status: "broken", active: true },
  { id: "s3", name: "Old Feed", health_status: "broken", active: false },
  { id: "s4", name: "TASS", health_status: "degraded", active: true },
];

describe("computeTopicCoverage", () => {
  it("passes a well-covered topic with no warnings", () => {
    const [c] = computeTopicCoverage({
      topics: [{ id: "t1", name: "Iran" }],
      recent: [
        { topic_id: "t1", source_id: "s1", items: 4 },
        { topic_id: "t1", source_id: "s2", items: 1 },
        { topic_id: "t1", source_id: "s4", items: 2 },
      ],
      contributors: [],
      sources,
      config,
    });
    expect(c).toMatchObject({ items: 7, sources: 3, warnings: [] });
  });

  it("flags thin coverage, including a topic with nothing at all", () => {
    const result = computeTopicCoverage({
      topics: [
        { id: "t1", name: "Iran" },
        { id: "t2", name: "US-Canada" },
      ],
      recent: [{ topic_id: "t1", source_id: "s1", items: 9 }],
      contributors: [],
      sources,
      config,
    });
    expect(result[0]!.warnings).toEqual(["Thin coverage: 9 items from 1 source in the last 7 days."]);
    expect(result[1]!.warnings).toEqual(["Thin coverage: 0 items from 0 sources in the last 7 days."]);
  });

  it("names active contributors that are now failing, ignoring muted ones", () => {
    const [c] = computeTopicCoverage({
      topics: [{ id: "t1", name: "Iran" }],
      recent: [
        { topic_id: "t1", source_id: "s1", items: 5 },
        { topic_id: "t1", source_id: "s4", items: 5 },
        { topic_id: "t1", source_id: "s2", items: 1 },
      ],
      contributors: [
        { topic_id: "t1", source_id: "s2", items: 10 },
        { topic_id: "t1", source_id: "s3", items: 10 },
        { topic_id: "t1", source_id: "s4", items: 3 },
        { topic_id: "t2", source_id: "s2", items: 3 },
      ],
      sources,
      config,
    });
    expect(c!.warnings).toEqual(["Sources that fed this topic are failing: Al-Monitor (broken), TASS (degraded)."]);
  });
});
