import { describe, expect, it } from "vitest";
import { extractListingLinks } from "../connectors/listing.js";

describe("extractListingLinks", () => {
  it("keeps only same-site links matching the pattern, resolved to absolute URLs", () => {
    const html = `
      <a href="/tr/yayin/s/2340"><span>➔</span> Sürpriz Stratejisi ve Psikolojik Harp</a>
      <a href="/tr/yayin">Tüm yayınlar</a>
      <a href="https://other.org/tr/yayin/s/1">Elsewhere article title</a>
      <a href="/tr/yayin/s/2339">Türkiye&#8217;nin PISA&#8217;daki yükselişi</a>`;
    expect(extractListingLinks(html, "https://www.tepav.org.tr/tr/yayin", "^/tr/yayin/s/\\d+$")).toEqual([
      { url: "https://www.tepav.org.tr/tr/yayin/s/2340", text: "Sürpriz Stratejisi ve Psikolojik Harp" },
      { url: "https://www.tepav.org.tr/tr/yayin/s/2339", text: "Türkiye’nin PISA’daki yükselişi" },
    ]);
  });

  it("dedupes repeated links, keeping the longest text", () => {
    const html = `
      <a href="/analysis/greenland-deal"><img src="x.jpg"></a>
      <a href="/analysis/greenland-deal">Trump’s Greenland Deal: Modest Gains, Lasting Costs</a>`;
    const links = extractListingLinks(html, "https://www.csis.org/analysis", "^/analysis/[^/]+$");
    expect(links).toEqual([{ url: "https://www.csis.org/analysis/greenland-deal", text: "Trump’s Greenland Deal: Modest Gains, Lasting Costs" }]);
  });

  it("ignores fragment-only and malformed links", () => {
    const html = `<a href="#top">Top</a><a href="http://[bad">Bad</a><a href="/blog/a-real-post">A real post title here</a>`;
    expect(extractListingLinks(html, "https://edam.org.tr/", "^/blog/[^/]+$").map((l) => l.url)).toEqual(["https://edam.org.tr/blog/a-real-post"]);
  });
});
