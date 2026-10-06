/**
 * Finds and checks a publication's feed from its homepage, for topic-driven
 * source suggestions. Tries the feeds the homepage advertises, then a few
 * conventional feed paths, then the sitemaps robots.txt lists. Respects
 * robots.txt (CLAUDE.md rule 6): a disallowed feed is reported, not used.
 */
import { assertPublicHttpUrl } from "@dailydigest/db";
import { fetchRssFeed } from "./rss.js";
import { countRecentSitemapEntries } from "./sitemap.js";
import { decodeEntities, fetchText, isAllowed, MAX_PAGE_BYTES } from "./web.js";

const COMMON_FEED_PATHS = ["/feed/", "/rss.xml", "/rss", "/feed.xml"];
const MAX_FEED_CANDIDATES = 4;

export interface DiscoveryResult {
  status: "ok" | "no_feed" | "blocked" | "stale";
  sourceType: "rss" | "sitemap" | null;
  feedUrl: string | null;
  recentItems: number | null;
  note: string | null;
}

/** Feeds advertised by <link rel="alternate" type="application/rss+xml"> tags. */
export function discoverFeedLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    // Comment feeds are not publications.
    if (/comments/i.test(href)) continue;
    try {
      links.push(new URL(decodeEntities(href), baseUrl).toString());
    } catch {
      // Ignore malformed hrefs.
    }
  }
  return [...new Set(links)];
}

/** Sitemap URLs listed in robots.txt, news sitemaps first. */
export function parseRobotsSitemaps(robots: string): string[] {
  const urls = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!);
  const unique = [...new Set(urls)];
  return [...unique.filter((u) => /news/i.test(u)), ...unique.filter((u) => !/news/i.test(u))];
}

/** Lower-cased host without "www.", for matching a suggestion against followed sources. */
export function hostKey(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function countRecent(dates: (string | undefined)[], sinceMs: number): number {
  return dates.filter((d) => d && Date.parse(d) >= sinceMs).length;
}

export async function discoverSource(homepage: string, freshDays: number): Promise<DiscoveryResult> {
  const none = { sourceType: null, feedUrl: null, recentItems: null };
  try {
    await assertPublicHttpUrl(homepage);
  } catch (err) {
    return { status: "blocked", ...none, note: (err as Error).message };
  }

  let html = "";
  try {
    html = await fetchText(homepage, MAX_PAGE_BYTES);
  } catch (err) {
    // Some sites refuse the homepage but still serve feeds; carry on.
    html = "";
    if (/40[13]|429/.test((err as Error).message)) {
      return { status: "blocked", ...none, note: `homepage refused: ${(err as Error).message}` };
    }
  }

  const sinceMs = Date.now() - freshDays * 24 * 60 * 60 * 1000;
  const advertised = discoverFeedLinks(html, homepage);
  const conventional = advertised.length > 0 ? [] : COMMON_FEED_PATHS.map((p) => new URL(p, homepage).toString());
  let stale: DiscoveryResult | null = null;
  let disallowed: string | null = null;

  for (const feedUrl of [...advertised, ...conventional].slice(0, MAX_FEED_CANDIDATES)) {
    if (!(await isAllowed(feedUrl))) {
      disallowed = feedUrl;
      continue;
    }
    try {
      const items = await fetchRssFeed(feedUrl);
      if (items.length === 0) continue;
      const recent = countRecent(
        items.map((i) => i.publishedAt),
        sinceMs,
      );
      if (recent > 0) return { status: "ok", sourceType: "rss", feedUrl, recentItems: recent, note: null };
      stale ??= { status: "stale", sourceType: "rss", feedUrl, recentItems: 0, note: `no item in the last ${freshDays} days` };
    } catch {
      // Not a feed (or unreachable): try the next candidate.
    }
  }

  let robots = "";
  try {
    robots = await fetchText(new URL("/robots.txt", homepage).toString(), 500_000);
  } catch {
    robots = "";
  }
  for (const sitemapUrl of parseRobotsSitemaps(robots).slice(0, 2)) {
    try {
      const recent = await countRecentSitemapEntries(sitemapUrl, freshDays);
      if (recent > 0) return { status: "ok", sourceType: "sitemap", feedUrl: sitemapUrl, recentItems: recent, note: null };
    } catch {
      // Unreadable sitemap: try the next one.
    }
  }

  if (stale) return stale;
  if (disallowed) return { status: "blocked", ...none, note: `robots.txt disallows ${disallowed}` };
  return { status: "no_feed", ...none, note: html ? "no feed or dated sitemap found" : "homepage unreachable" };
}
