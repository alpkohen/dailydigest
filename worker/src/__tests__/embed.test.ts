import { describe, expect, it } from "vitest";
import { embeddingInput } from "../stages/embed.js";

describe("embeddingInput", () => {
  it("returns just the title when there is no text", () => {
    expect(embeddingInput("A title", null)).toBe("A title");
  });

  it("includes the title and text", () => {
    expect(embeddingInput("A title", "some body text")).toBe("A title\n\nsome body text");
  });

  it("caps at 500 words of text", () => {
    const longText = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");
    const result = embeddingInput("Title", longText);
    const wordCount = result.split("\n\n")[1]!.split(/\s+/).length;
    expect(wordCount).toBe(500);
  });

  it("enforces a hard character cap even for pathological input (e.g. one giant whitespace-free token)", () => {
    const pathological = "x".repeat(50_000);
    const result = embeddingInput("Title", pathological);
    expect(result.length).toBeLessThanOrEqual(20_000);
  });
});
