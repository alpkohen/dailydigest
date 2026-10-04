import { describe, expect, it } from "vitest";
import { cleanTitle, decodeEntities, parsePageMeta, parseRobotsDisallows, parseSitemap, selectRecent } from "../connectors/sitemap.js";

describe("parseSitemap", () => {
  it("reads child sitemaps from an index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://a.org/s1.xml</loc><lastmod>2026-10-04</lastmod></sitemap><sitemap><loc>https://a.org/s2.xml</loc></sitemap></sitemapindex>`;
    const { children, entries } = parseSitemap(xml);
    expect(children.map((c) => c.url)).toEqual(["https://a.org/s1.xml", "https://a.org/s2.xml"]);
    expect(children[1]!.date).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("reads url entries, preferring news title and publication date", () => {
    const xml = `<urlset><url><loc>https://a.org/x?a=1&amp;b=2</loc><lastmod>2026-10-01</lastmod><news:news><news:publication_date>2026-10-03T09:00:00Z</news:publication_date><news:title><![CDATA[Merz arrives in Kyiv]]></news:title></news:news></url></urlset>`;
    const { entries } = parseSitemap(xml);
    expect(entries[0]).toEqual({ url: "https://a.org/x?a=1&b=2", date: "2026-10-03T09:00:00Z", title: "Merz arrives in Kyiv" });
  });
});

describe("selectRecent", () => {
  const since = Date.parse("2026-10-01T00:00:00Z");
  it("keeps dated entries inside the window and drops undated pages in a dated sitemap", () => {
    const picked = selectRecent(
      [
        { url: "old", date: "2013-07-01", title: null },
        { url: "new", date: "2026-10-03", title: null },
        { url: "undated-page", date: null, title: null },
      ],
      since,
    );
    expect(picked.map((e) => e.url)).toEqual(["new"]);
  });

  it("keeps undated entries when the sitemap has no dates at all", () => {
    const picked = selectRecent([{ url: "a", date: null, title: null }, { url: "b", date: null, title: null }], since);
    expect(picked.map((e) => e.url)).toEqual(["a", "b"]);
  });
});

describe("parsePageMeta", () => {
  it("prefers og tags and decodes entities", () => {
    const html = `<html><head><title>Site | Fallback</title><meta property="og:title" content="Iraq after US withdrawal &amp; regional balance"><meta name="description" content="Analysis of &#39;new&#39; security"></head></html>`;
    expect(parsePageMeta(html)).toEqual({ title: "Iraq after US withdrawal & regional balance", description: "Analysis of 'new' security" });
  });

  it("falls back to <title>", () => {
    expect(parsePageMeta("<title>Plain title</title>").title).toBe("Plain title");
  });
});

describe("parseRobotsDisallows", () => {
  it("collects only the generic group's rules", () => {
    const robots = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /search/\nDisallow: /?s=\nAllow: /wp-admin/admin-ajax.php\n\nUser-agent: Bingbot\nDisallow: /private`;
    expect(parseRobotsDisallows(robots)).toEqual(["/search/", "/?s="]);
  });

  it("treats grouped user-agent lines together", () => {
    const robots = `User-agent: Googlebot\nUser-agent: *\nDisallow: /\n`;
    expect(parseRobotsDisallows(robots)).toEqual(["/"]);
  });
});

describe("cleanTitle", () => {
  it("drops a trailing site name", () => {
    expect(cleanTitle("Stablecoins after GENIUS: Private money | Brookings")).toBe("Stablecoins after GENIUS: Private money");
    expect(cleanTitle("How Europeans can support the south Caucasus – European Council on Foreign Relations")).toBe(
      "How Europeans can support the south Caucasus",
    );
  });

  it("leaves short or unsuffixed titles alone", () => {
    expect(cleanTitle("Iran | Analysis")).toBe("Iran | Analysis");
    expect(cleanTitle("Russia-Ukraine talks resume")).toBe("Russia-Ukraine talks resume");
  });
});

describe("decodeEntities", () => {
  it("unwraps CDATA", () => {
    expect(decodeEntities("<![CDATA[ a & b ]]>")).toBe("a & b");
  });
});
