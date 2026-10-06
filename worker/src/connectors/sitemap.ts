/**
 * Sitemap connector, for sources that publish no RSS feed. Reads a sitemap
 * (or a sitemap index), keeps entries published/modified within the window,
 * and fills in each new entry's title and summary from the page's own
 * og:/meta tags. Respects robots.txt (CLAUDE.md rule 6): sitemap and page
 * fetches are skipped if the site disallows them for generic crawlers.
 */
import { cleanTitle, fetchText, isAllowed, MAX_PAGE_BYTES, parsePageMeta, tag } from "./web.js";

const MAX_SITEMAP_BYTES = 10_000_000;
// Some sitemaps are slow to serve (seen live: ISW's 730 KB posts sitemap
// takes ~40 s).
const SITEMAP_FETCH_TIMEOUT_MS = 60_000;
const MAX_CHILD_SITEMAPS = 6;
const UNDATED_ENTRY_CAP = 30;
// Child sitemaps that list site furniture rather than publications
// (seen live: Brookings' index mixes page/event/person/project sitemaps in
// with its article ones, all with fresh lastmods).
const NON_CONTENT_CHILD = /[/_-](page|event|events|person|people|author|authors|project|center|centre|collection|category|tag|taxonomy|video|videos|podcast|landing|map|gallery)s?[-_.\d]/i;

export interface SitemapEntry {
  url: string;
  date: string | null;
  title: string | null;
}

export interface WebItem {
  url: string;
  title: string;
  standfirst: string | null;
  publishedAt: string | null;
}

/**
 * A publication date embedded in the URL path (/2026/10/05/ or /2026/10/).
 * Sitemaps' lastmod changes whenever an old page is touched (seen live: NATO
 * lists its 2021 summit pages with October 2026 lastmods), so a path date,
 * when present, is the better signal of when something was published.
 */
export function pathDate(url: string, lastmod: string | null = null): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = /\/(20\d{2})\/(0[1-9]|1[0-2])(?:\/(0[1-9]|[12]\d|3[01]))?\//.exec(`${path}/`);
  if (!m) return null;
  if (m[3]) return `${m[1]}-${m[2]}-${m[3]}`;
  // Month only (/2026/10/): too coarse to date the entry itself, but it
  // still exposes an old page with a fresh lastmod. Trust a lastmod from
  // that same month; otherwise the page is from the month in its path.
  const month = `${m[1]}-${m[2]}`;
  if (lastmod && lastmod.slice(0, 7) === month) return lastmod;
  return `${month}-01`;
}

/** Parses a sitemap document: either child sitemaps (index) or url entries. */
export function parseSitemap(xml: string): { children: SitemapEntry[]; entries: SitemapEntry[] } {
  const children = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)].map((m) => ({
    url: tag(m[1]!, "loc") ?? "",
    date: tag(m[1]!, "lastmod"),
    title: null,
  }));
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => {
    const url = tag(m[1]!, "loc") ?? "";
    const lastmod = tag(m[1]!, "lastmod");
    return {
      url,
      date: tag(m[1]!, "news:publication_date") ?? pathDate(url, lastmod) ?? lastmod,
      title: tag(m[1]!, "news:title"),
    };
  });
  return { children: children.filter((c) => c.url), entries: entries.filter((e) => e.url) };
}

function isRecent(date: string | null, sinceMs: number): boolean | null {
  if (!date) return null;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t >= sinceMs : null;
}

/**
 * Keeps dated entries inside the window. Undated entries are kept (up to a
 * cap) only when the sitemap has no dates at all; in a dated sitemap they
 * are static pages (seen live: IPC's sitemap mixes dated posts with undated
 * site pages titled just "İPM | IPC").
 */
export function selectRecent(entries: SitemapEntry[], sinceMs: number): SitemapEntry[] {
  const dated = entries.filter((e) => isRecent(e.date, sinceMs) === true);
  const hasDates = entries.some((e) => isRecent(e.date, sinceMs) !== null);
  const undated = hasDates ? [] : entries.filter((e) => isRecent(e.date, sinceMs) === null).slice(0, UNDATED_ENTRY_CAP);
  return [...dated, ...undated];
}

async function collectEntries(url: string, sinceMs: number, depth: number, pattern: RegExp | null): Promise<SitemapEntry[]> {
  if (!(await isAllowed(url))) throw new Error(`robots.txt disallows ${url}`);
  const { children, entries } = parseSitemap(await fetchText(url, MAX_SITEMAP_BYTES, SITEMAP_FETCH_TIMEOUT_MS));
  if (children.length === 0) {
    const wanted = pattern ? entries.filter((e) => pattern.test(new URL(e.url).pathname)) : entries;
    return selectRecent(wanted, sinceMs);
  }
  if (depth >= 2) return [];

  // Content children with a recent lastmod, newest first; undated children
  // only as a fallback.
  const content = children.filter((c) => !NON_CONTENT_CHILD.test(new URL(c.url).pathname));
  const recentChildren = content
    .filter((c) => isRecent(c.date, sinceMs) === true)
    .sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!));
  // Undated children: highest-numbered first. WordPress-style indexes
  // (posts-1.xml ... posts-6.xml) append new posts to the last page.
  const pageNumber = (u: string) => Number(/(\d+)\.xml$/i.exec(u)?.[1] ?? 0);
  const undated = content.filter((c) => !c.date).sort((a, b) => pageNumber(b.url) - pageNumber(a.url));
  const picked = (recentChildren.length > 0 ? recentChildren : undated).slice(0, MAX_CHILD_SITEMAPS);
  const nested = await Promise.all(picked.map((c) => collectEntries(c.url, sinceMs, depth + 1, pattern).catch(() => [])));
  return nested.flat();
}

/** How many entries a sitemap lists within the window (no page fetches). */
export async function countRecentSitemapEntries(sitemapUrl: string, sinceDays: number): Promise<number> {
  const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const entries = await collectEntries(sitemapUrl, since, 0, null);
  return new Set(entries.map((e) => e.url)).size;
}

/**
 * Fetches a source's recent sitemap entries. `isKnown` filters out URLs
 * already stored, so pages are only fetched once, for genuinely new entries.
 */
export async function fetchSitemapItems(
  sitemapUrl: string,
  sinceDays: number,
  isKnown: (urls: string[]) => Promise<Set<string>>,
  maxNewPages = 25,
  // Optional regex over entry paths, for sitemaps that mix news with site
  // furniture (NATO, White House).
  linkPattern: string | null = null,
): Promise<WebItem[]> {
  // Floored to UTC midnight: many sitemaps give date-only lastmods
  // ("2026-10-01"), which parse as midnight and would otherwise fall just
  // outside a rolling window.
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const entries = await collectEntries(sitemapUrl, since.getTime(), 0, linkPattern ? new RegExp(linkPattern) : null);
  const unique = [...new Map(entries.map((e) => [e.url, e])).values()];
  const known = await isKnown(unique.map((e) => e.url));
  const fresh = unique.filter((e) => !known.has(e.url)).slice(0, maxNewPages);

  const items: WebItem[] = [];
  for (const entry of fresh) {
    if (entry.title) {
      items.push({ url: entry.url, title: entry.title, standfirst: null, publishedAt: entry.date });
      continue;
    }
    try {
      if (!(await isAllowed(entry.url))) continue;
      const meta = parsePageMeta(await fetchText(entry.url, MAX_PAGE_BYTES));
      if (meta.title) items.push({ url: entry.url, title: cleanTitle(meta.title), standfirst: meta.description, publishedAt: entry.date ?? meta.publishedAt });
    } catch {
      // One unreachable page shouldn't drop the rest of the source.
    }
  }
  return items;
}
