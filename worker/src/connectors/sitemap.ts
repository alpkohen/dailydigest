/**
 * Sitemap connector, for sources that publish no RSS feed. Reads a sitemap
 * (or a sitemap index), keeps entries published/modified within the window,
 * and fills in each new entry's title and summary from the page's own
 * og:/meta tags. Respects robots.txt (CLAUDE.md rule 6): sitemap and page
 * fetches are skipped if the site disallows them for generic crawlers.
 */

const USER_AGENT = "Mozilla/5.0 (dailydigest personal use)";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SITEMAP_BYTES = 10_000_000;
const MAX_PAGE_BYTES = 400_000;
const MAX_CHILD_SITEMAPS = 6;
const UNDATED_ENTRY_CAP = 30;
// Child sitemaps that list site furniture rather than publications
// (seen live: Brookings' index mixes page/event/person/project sitemaps in
// with its article ones, all with fresh lastmods).
const NON_CONTENT_CHILD = /[/_-](page|event|events|person|people|author|authors|project|center|centre|collection|category|tag|taxonomy|video|videos|podcast|landing)s?[-_.\d]/i;

export interface SitemapEntry {
  url: string;
  date: string | null;
  title: string | null;
}

export interface SitemapItem {
  url: string;
  title: string;
  standfirst: string | null;
  publishedAt: string | null;
}

async function fetchText(url: string, maxBytes: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  } finally {
    clearTimeout(timeout);
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1]!) : null;
}

/** Parses a sitemap document: either child sitemaps (index) or url entries. */
export function parseSitemap(xml: string): { children: SitemapEntry[]; entries: SitemapEntry[] } {
  const children = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)].map((m) => ({
    url: tag(m[1]!, "loc") ?? "",
    date: tag(m[1]!, "lastmod"),
    title: null,
  }));
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((m) => ({
    url: tag(m[1]!, "loc") ?? "",
    date: tag(m[1]!, "news:publication_date") ?? tag(m[1]!, "lastmod"),
    title: tag(m[1]!, "news:title"),
  }));
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

/** Drops a trailing site-name suffix ("... | Brookings", "... – ECFR"). */
export function cleanTitle(title: string): string {
  const m = /^(.{20,}?)\s+[|–]\s+([^|–]{1,50})$/.exec(title.trim());
  return m ? m[1]!.trim() : title.trim();
}

/** Page metadata from og:/meta tags, falling back to <title>. */
export function parsePageMeta(html: string): { title: string | null; description: string | null } {
  const meta = (attr: string, value: string) => {
    const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*>`, "i");
    const m = re.exec(html);
    if (!m) return null;
    const content = /content=["']([^"']*)["']/i.exec(m[0]);
    return content ? decodeEntities(content[1]!) : null;
  };
  const title = meta("property", "og:title") ?? meta("name", "twitter:title") ?? tag(html, "title");
  const description = meta("property", "og:description") ?? meta("name", "description");
  return { title: title || null, description: description || null };
}

// --- robots.txt (generic "User-agent: *" rules only) ---

const robotsCache = new Map<string, string[]>();

export function parseRobotsDisallows(robots: string): string[] {
  const disallows: string[] = [];
  let applies = false;
  let sawRuleSinceAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      // Consecutive User-agent lines form one group.
      if (sawRuleSinceAgent) applies = false;
      sawRuleSinceAgent = false;
      if (value === "*") applies = true;
    } else {
      sawRuleSinceAgent = true;
      if (applies && key === "disallow" && value) disallows.push(value);
    }
  }
  return disallows;
}

function pathMatches(path: string, rule: string): boolean {
  const pattern = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$$/, "$");
  return new RegExp(`^${pattern}`).test(path);
}

async function isAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  let disallows = robotsCache.get(u.host);
  if (!disallows) {
    try {
      disallows = parseRobotsDisallows(await fetchText(`${u.protocol}//${u.host}/robots.txt`, 500_000));
    } catch {
      disallows = [];
    }
    robotsCache.set(u.host, disallows);
  }
  const path = u.pathname + u.search;
  return !disallows.some((rule) => pathMatches(path, rule));
}

async function collectEntries(url: string, sinceMs: number, depth: number): Promise<SitemapEntry[]> {
  if (!(await isAllowed(url))) throw new Error(`robots.txt disallows ${url}`);
  const { children, entries } = parseSitemap(await fetchText(url, MAX_SITEMAP_BYTES));
  if (children.length === 0) return selectRecent(entries, sinceMs);
  if (depth >= 2) return [];

  // Content children with a recent lastmod, newest first; undated children
  // only as a fallback.
  const content = children.filter((c) => !NON_CONTENT_CHILD.test(new URL(c.url).pathname));
  const recentChildren = content
    .filter((c) => isRecent(c.date, sinceMs) === true)
    .sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!));
  // Undated children: highest-numbered first. WordPress-style indexes
  // (posts-1.xml ... posts-6.xml) append new posts to the last page.
  const pageNumber = (url: string) => Number(/(\d+)\.xml$/i.exec(url)?.[1] ?? 0);
  const undated = content.filter((c) => !c.date).sort((a, b) => pageNumber(b.url) - pageNumber(a.url));
  const picked = (recentChildren.length > 0 ? recentChildren : undated).slice(0, MAX_CHILD_SITEMAPS);
  const nested = await Promise.all(picked.map((c) => collectEntries(c.url, sinceMs, depth + 1).catch(() => [])));
  return nested.flat();
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
): Promise<SitemapItem[]> {
  // Floored to UTC midnight: many sitemaps give date-only lastmods
  // ("2026-10-01"), which parse as midnight and would otherwise fall just
  // outside a rolling window.
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);
  const entries = await collectEntries(sitemapUrl, since.getTime(), 0);
  const unique = [...new Map(entries.map((e) => [e.url, e])).values()];
  const known = await isKnown(unique.map((e) => e.url));
  const fresh = unique.filter((e) => !known.has(e.url)).slice(0, maxNewPages);

  const items: SitemapItem[] = [];
  for (const entry of fresh) {
    if (entry.title) {
      items.push({ url: entry.url, title: entry.title, standfirst: null, publishedAt: entry.date });
      continue;
    }
    try {
      if (!(await isAllowed(entry.url))) continue;
      const meta = parsePageMeta(await fetchText(entry.url, MAX_PAGE_BYTES));
      if (meta.title) items.push({ url: entry.url, title: cleanTitle(meta.title), standfirst: meta.description, publishedAt: entry.date });
    } catch {
      // One unreachable page shouldn't drop the rest of the source.
    }
  }
  return items;
}
