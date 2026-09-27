import { describe, expect, it, vi } from "vitest";
import { createFeedbackLink, verifyFeedbackLink } from "../signedLink.js";

describe("signed feedback links", () => {
  const secret = "test-secret";

  it("round-trips a valid link", () => {
    const token = createFeedbackLink({ targetType: "story", targetId: "abc", signal: "relevant" }, secret);
    const payload = verifyFeedbackLink(token, secret);
    expect(payload).toMatchObject({ targetType: "story", targetId: "abc", signal: "relevant" });
  });

  it("rejects a tampered token", () => {
    const token = createFeedbackLink({ targetType: "story", targetId: "abc", signal: "relevant" }, secret);
    const [data] = token.split(".");
    const tampered = `${data}.wrongsignature000000000000000000000000000`;
    expect(verifyFeedbackLink(tampered, secret)).toBeNull();
  });

  it("rejects a link signed with a different secret", () => {
    const token = createFeedbackLink({ targetType: "story", targetId: "abc", signal: "relevant" }, secret);
    expect(verifyFeedbackLink(token, "different-secret")).toBeNull();
  });

  it("rejects an expired link", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createFeedbackLink({ targetType: "story", targetId: "abc", signal: "relevant" }, secret, 14);
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    expect(verifyFeedbackLink(token, secret)).toBeNull();
    vi.useRealTimers();
  });

  it("rejects a malformed token", () => {
    expect(verifyFeedbackLink("not-a-valid-token", secret)).toBeNull();
  });
});
