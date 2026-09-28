import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "public.example.com") return [{ address: "93.184.216.34" }];
    if (hostname === "rebinds-to-metadata.example.com") return [{ address: "169.254.169.254" }];
    if (hostname === "unresolvable.example.com") throw new Error("ENOTFOUND");
    return [{ address: "93.184.216.34" }];
  }),
}));

const { assertPublicHttpUrl } = await import("../urlSafety.js");

describe("assertPublicHttpUrl", () => {
  it("allows an ordinary public hostname", async () => {
    await expect(assertPublicHttpUrl("https://public.example.com/feed.xml")).resolves.toBeUndefined();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertPublicHttpUrl("ftp://public.example.com/feed.xml")).rejects.toThrow();
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects localhost and *.localhost", async () => {
    await expect(assertPublicHttpUrl("http://localhost:5432/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://foo.localhost/")).rejects.toThrow();
  });

  it("rejects literal private and reserved IPv4 addresses", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://10.0.0.5/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://172.16.4.4/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://192.168.1.1/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
  });

  it("rejects literal private/loopback IPv6 addresses", async () => {
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://[fe80::1]/")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://[fd00::1]/")).rejects.toThrow();
  });

  it("rejects a hostname that resolves to a private/metadata IP (DNS rebinding)", async () => {
    await expect(assertPublicHttpUrl("http://rebinds-to-metadata.example.com/feed.xml")).rejects.toThrow();
  });

  it("rejects a hostname that fails to resolve", async () => {
    await expect(assertPublicHttpUrl("http://unresolvable.example.com/feed.xml")).rejects.toThrow();
  });

  it("rejects a malformed URL", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toThrow();
  });
});
