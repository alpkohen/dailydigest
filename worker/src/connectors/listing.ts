/**
 * Listing-page connector, for sources with neither an RSS feed nor a usable
 * sitemap but a public "latest publications" page (TEPAV, EDAM, CSIS). Reads
 * article links matching the source's link pattern, takes each title from the
 * link text, and opens only new articles for summary and date. Respects
 * robots.txt (CLAUDE.md rule 6).
 */
import type { WebItem } from "./sitemap.js";
import { cleanTitle, decodeEntities, fetchText, isAllowed, MAX_PAGE_BYTES, parsePageMeta } from "./web.js";

const MAX_LISTING_BYTES = 3_000_000;
const MAX_LINKS = 40;
const MIN_LINK_TEXT = 10;

export interface ListingLink {
  url: string;
  text: string;
}

function linkText(inner: string): string {
  return decodeEntities(inner.replace(/<[^>]+>/g, " "))
    .replace(/^[\s➔→»›>•·\-–]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Article links on a listing page whose path matches `pattern`, in page
 * order, deduplicated; when a link appears more than once (image + title),
 * the longest link text wins.
 */
export function extractListingLinks(html: string, baseUrl: string, pattern: string): ListingLink[] {
  const base = new URL(baseUrl);
  const re = new RegExp(pattern);
  const byUrl = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]!), base);
    } catch {
      continue;
    }
    if (url.host !== base.host || !re.test(url.pathname)) continue;
    const key = url.toString();
    const text = linkText(m[2]!);
    if ((byUrl.get(key)?.length ?? -1) < text.length) byUrl.set(key, text);
  }
  return [...byUrl.entries()].slice(0, MAX_LINKS).map(([url, text]) => ({ url, text }));
}

export async function fetchListingItems(
  listingUrl: string,
  linkPattern: string,
  isKnown: (urls: string[]) => Promise<Set<string>>,
  maxNewPages = 25,
): Promise<WebItem[]> {
  if (!(await isAllowed(listingUrl))) throw new Error(`robots.txt disallows ${listingUrl}`);
  const links = extractListingLinks(await fetchText(listingUrl, MAX_LISTING_BYTES), listingUrl, linkPattern);
  if (links.length === 0) throw new Error(`no article links matched ${linkPattern} on ${listingUrl}`);

  const known = await isKnown(links.map((l) => l.url));
  const fresh = links.filter((l) => !known.has(l.url)).slice(0, maxNewPages);

  const items: WebItem[] = [];
  for (const link of fresh) {
    const fromLink = link.text.length >= MIN_LINK_TEXT ? link.text : null;
    let meta: ReturnType<typeof parsePageMeta> = { title: null, description: null, publishedAt: null };
    try {
      if (await isAllowed(link.url)) meta = parsePageMeta(await fetchText(link.url, MAX_PAGE_BYTES));
    } catch {
      // The listing already gave the title; the page only adds detail.
    }
    const title = fromLink ?? (meta.title ? cleanTitle(meta.title) : null);
    if (!title) continue;
    const standfirst = meta.description && meta.description !== meta.title ? meta.description : null;
    items.push({ url: link.url, title, standfirst, publishedAt: meta.publishedAt });
  }
  return items;
}
