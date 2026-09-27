import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../lib/canonicalUrl.js";

describe("canonicalizeUrl", () => {
  it("strips tracking params", () => {
    expect(
      canonicalizeUrl("https://example.com/a/story?utm_source=x&utm_medium=y&id=42"),
    ).toBe("https://example.com/a/story?id=42");
  });

  it("removes fbclid and gclid", () => {
    expect(canonicalizeUrl("https://example.com/x?fbclid=abc&gclid=def")).toBe(
      "https://example.com/x",
    );
  });

  it("drops the fragment", () => {
    expect(canonicalizeUrl("https://example.com/x#section")).toBe("https://example.com/x");
  });

  it("lowercases the hostname", () => {
    expect(canonicalizeUrl("https://EXAMPLE.com/x")).toBe("https://example.com/x");
  });

  it("drops a trailing slash", () => {
    expect(canonicalizeUrl("https://example.com/x/")).toBe("https://example.com/x");
  });

  it("sorts remaining query params so order doesn't affect the canonical form", () => {
    expect(canonicalizeUrl("https://example.com/x?b=2&a=1")).toBe(
      canonicalizeUrl("https://example.com/x?a=1&b=2"),
    );
  });

  it("keeps non-tracking query params untouched", () => {
    expect(canonicalizeUrl("https://example.com/x?id=42")).toBe("https://example.com/x?id=42");
  });
});
