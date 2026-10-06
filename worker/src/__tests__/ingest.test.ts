import { describe, expect, it } from "vitest";
import { initialStatus } from "../stages/ingest.js";

describe("initialStatus", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");

  it("treats recent and undated items as new", () => {
    expect(initialStatus("2026-10-05T08:00:00Z", now)).toBe("new");
    expect(initialStatus(null, now)).toBe("new");
    expect(initialStatus("not a date", now)).toBe("new");
  });

  it("stores items older than a week as already unmatched", () => {
    expect(initialStatus("2026-09-20T08:00:00Z", now)).toBe("not_relevant");
  });
});
