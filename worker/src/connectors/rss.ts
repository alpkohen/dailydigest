import Parser from "rss-parser";
import { assertPublicHttpUrl } from "@dailydigest/db";

const parser = new Parser({ timeout: 15_000 });

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;

export interface RssItem {
  title: string;
  url: string;
  standfirst?: string;
  author?: string;
  publishedAt?: string;
}

/**
 * SSRF guard: rss-parser's own maxRedirects option can't actually disable
 * redirect-following (passing 0 gets silently defaulted back to 5 by a
 * falsy check in its own source), and even a positive limit re-fetches
 * each hop with no hook to validate it - so a feed could 302 a validated
 * public URL to an internal address at fetch time (e.g. a private IP or
 * the cloud metadata endpoint). Fetch the chain manually instead,
 * re-validating every redirect target the same way the initial URL was
 * validated, then hand rss-parser the final response body directly.
 */
export async function fetchFeedXml(feedUrl: string): Promise<string> {
  let currentUrl = feedUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(currentUrl, { redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect from ${currentUrl} had no Location header.`);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
    return response.text();
  }
  throw new Error("Too many redirects.");
}

/** Fetches and parses one RSS/Atom feed. Throws on network/parse failure so the caller can record source health. */
export async function fetchRssFeed(feedUrl: string): Promise<RssItem[]> {
  const xml = await fetchFeedXml(feedUrl);
  const feed = await parser.parseString(xml);
  return (feed.items ?? [])
    .filter((item): item is typeof item & { link: string; title: string } => Boolean(item.link && item.title))
    .map((item) => ({
      title: item.title.trim().replace(/\s+/g, " "),
      url: item.link,
      standfirst: item.contentSnippet?.trim().replace(/\s+/g, " ") ?? item.summary?.trim().replace(/\s+/g, " "),
      author: item.creator ?? item.author,
      publishedAt: item.isoDate ?? item.pubDate,
    }));
}
