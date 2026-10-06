import { describe, expect, it } from "vitest";
import { discoverFeedLinks, hostKey, parseRobotsSitemaps } from "../connectors/discover.js";

describe("discoverFeedLinks", () => {
  it("finds advertised RSS and Atom feeds, resolving relative hrefs", () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" title="News" href="/feed/">
      <link href="https://x.org/atom.xml" type="application/atom+xml" rel="alternate">
      <link rel="stylesheet" href="/style.css">
    </head>`;
    expect(discoverFeedLinks(html, "https://x.org/")).toEqual(["https://x.org/feed/", "https://x.org/atom.xml"]);
  });

  it("skips comment feeds and decodes entities", () => {
    const html = `<link rel="alternate" type="application/rss+xml" href="/comments/feed/">
      <link rel="alternate" type="application/rss+xml" href="/rss?a=1&amp;b=2">`;
    expect(discoverFeedLinks(html, "https://x.org")).toEqual(["https://x.org/rss?a=1&b=2"]);
  });
});

describe("parseRobotsSitemaps", () => {
  it("lists news sitemaps first, without duplicates", () => {
    const robots = "User-agent: *\nDisallow: /search\nSitemap: https://x.org/sitemap.xml\nsitemap: https://x.org/news-sitemap.xml\nSitemap: https://x.org/sitemap.xml";
    expect(parseRobotsSitemaps(robots)).toEqual(["https://x.org/news-sitemap.xml", "https://x.org/sitemap.xml"]);
  });
});

describe("hostKey", () => {
  it("ignores www and case", () => {
    expect(hostKey("https://WWW.Example.com/feed")).toBe("example.com");
    expect(hostKey("not a url")).toBeNull();
  });
});
