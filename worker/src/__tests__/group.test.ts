import { describe, expect, it } from "vitest";
import { resolveGrouping } from "../stages/group.js";

const items = [
  { id: "a", title: "Strike on Kyiv power plant", standfirst: "Overnight attack" },
  { id: "b", title: "Kyiv blackout after strike", standfirst: null },
  { id: "c", title: "Ceasefire talks in Istanbul", standfirst: "Delegations meet" },
];

describe("resolveGrouping", () => {
  it("attaches to existing events and creates new ones", () => {
    const result = resolveGrouping(items, ["story-1"], {
      assign: [{ i: 2, e: 0 }],
      new_events: [{ items: [0, 1], title: "Kiev'e saldırı", summary: "Enerji santrali vuruldu.", tier: 1 }],
    });
    expect(result.attach).toEqual([{ itemId: "c", storyId: "story-1" }]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.itemIds).toEqual(["a", "b"]);
  });

  it("never drops an article the model left out", () => {
    const result = resolveGrouping(items, [], { assign: [], new_events: [{ items: [0], title: "x", summary: "y", tier: 2 }] });
    const covered = [...result.attach.map((a) => a.itemId), ...result.created.flatMap((c) => c.itemIds)];
    expect(covered.sort()).toEqual(["a", "b", "c"]);
  });

  it("ignores invalid indexes and duplicates", () => {
    const result = resolveGrouping(items, ["story-1"], {
      assign: [{ i: 0, e: 5 }, { i: 9, e: 0 }, { i: 1, e: 0 }, { i: 1, e: 0 }],
      new_events: [{ items: [1, 2], title: "t", summary: "s", tier: 3 }],
    });
    const covered = [...result.attach.map((a) => a.itemId), ...result.created.flatMap((c) => c.itemIds)];
    expect(covered.sort()).toEqual(["a", "b", "c"]);
    expect(covered.filter((id) => id === "b")).toHaveLength(1);
  });

  it("falls back to one story per article when the model failed", () => {
    const result = resolveGrouping(items, ["story-1"], null);
    expect(result.attach).toHaveLength(0);
    expect(result.created.map((c) => c.itemIds)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("strips em dashes from generated text", () => {
    const result = resolveGrouping(items.slice(0, 1), [], {
      assign: [],
      new_events: [{ items: [0], title: "Saldırı — Kiev", summary: "Santral vuruldu – elektrik kesildi.", tier: 1 }],
    });
    expect(result.created[0]!.title).toBe("Saldırı, Kiev");
    expect(result.created[0]!.summary).not.toMatch(/[—–]/);
  });
});
