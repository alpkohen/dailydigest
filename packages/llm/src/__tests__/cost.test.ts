import { describe, expect, it } from "vitest";
import { computeCostUsd } from "../cost.js";

describe("computeCostUsd", () => {
  const prices = {
    "test-model": { input: 1, output: 2 },
  };

  it("computes cost from per-million-token prices", () => {
    const cost = computeCostUsd("test-model", 1_000_000, 500_000, prices);
    expect(cost).toBeCloseTo(1 * 1 + 2 * 0.5, 6);
  });

  it("throws when the model has no price entry", () => {
    expect(() => computeCostUsd("unknown-model", 1, 1, prices)).toThrow();
  });
});
