import { describe, expect, it } from "vitest";
import { cosineSimilarity } from "../lib/dedup.js";
import { parseEmbedding } from "../lib/vector.js";

describe("parseEmbedding", () => {
  it("parses the pgvector text literal PostgREST returns", () => {
    expect(parseEmbedding("[0.5,-0.25,1]")).toEqual([0.5, -0.25, 1]);
  });

  it("passes real arrays through and maps null/garbage to null", () => {
    expect(parseEmbedding([1, 2])).toEqual([1, 2]);
    expect(parseEmbedding(null)).toBeNull();
    expect(parseEmbedding(undefined)).toBeNull();
    expect(parseEmbedding("not json")).toBeNull();
    expect(parseEmbedding("{\"a\":1}")).toBeNull();
  });

  it("makes cosine similarity a real number instead of NaN", () => {
    const a = parseEmbedding("[1,0,0]")!;
    const b = parseEmbedding("[1,0,0]")!;
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    expect(cosineSimilarity("[1,0,0]" as unknown as number[], "[1,0,0]" as unknown as number[])).toBeNaN();
  });
});
