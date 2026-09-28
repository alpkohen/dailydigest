import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeedXml } from "../connectors/rss.js";

function jsonResponse(status: number, headers: Record<string, string> = {}, body = ""): Response {
  return new Response(body, { status, headers });
}

describe("fetchFeedXml (SSRF guard)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects the initial URL if it points at a private address", async () => {
    await expect(fetchFeedXml("http://127.0.0.1/feed.xml")).rejects.toThrow();
  });

  it("fetches a plain public feed successfully", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}, "<rss></rss>"));
    vi.stubGlobal("fetch", fetchMock);

    const xml = await fetchFeedXml("http://93.184.216.34/feed.xml");
    expect(xml).toBe("<rss></rss>");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to another public address", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(302, { location: "http://93.184.216.35/final.xml" }))
      .mockResolvedValueOnce(jsonResponse(200, {}, "<rss>final</rss>"));
    vi.stubGlobal("fetch", fetchMock);

    const xml = await fetchFeedXml("http://93.184.216.34/feed.xml");
    expect(xml).toBe("<rss>final</rss>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a redirect whose target is a private/metadata address", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(302, { location: "http://169.254.169.254/latest/meta-data/" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFeedXml("http://93.184.216.34/feed.xml")).rejects.toThrow();
  });

  it("gives up after too many redirects", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(302, { location: "http://93.184.216.34/loop.xml" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFeedXml("http://93.184.216.34/feed.xml")).rejects.toThrow(/too many redirects/i);
  });
});
