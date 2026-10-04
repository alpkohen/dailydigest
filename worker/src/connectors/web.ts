/**
 * Shared helpers for connectors that read ordinary web pages (sitemap,
 * listing page): a bounded fetch, robots.txt checks (CLAUDE.md rule 6),
 * and page metadata from og:/meta tags.
 */

const USER_AGENT = "Mozilla/5.0 (dailydigest personal use)";
const FETCH_TIMEOUT_MS = 20_000;
export const MAX_PAGE_BYTES = 400_000;

export async function fetchText(url: string, maxBytes: number): Promise<string> {
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

export function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decodeEntities(m[1]!) : null;
}

/** Drops a trailing site-name suffix ("... | Brookings", "... – ECFR"). */
export function cleanTitle(title: string): string {
  const m = /^(.{20,}?)\s+[|–]\s+([^|–]{1,50})$/.exec(title.trim());
  return m ? m[1]!.trim() : title.trim();
}

/** Page metadata from og:/meta tags, falling back to <title>. */
export function parsePageMeta(html: string): { title: string | null; description: string | null; publishedAt: string | null } {
  const meta = (attr: string, value: string) => {
    const re = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*>`, "i");
    const m = re.exec(html);
    if (!m) return null;
    const content = /content=["']([^"']*)["']/i.exec(m[0]);
    return content ? decodeEntities(content[1]!) : null;
  };
  const title = meta("property", "og:title") ?? meta("name", "twitter:title") ?? tag(html, "title");
  const description = meta("property", "og:description") ?? meta("name", "description");
  const published =
    meta("property", "article:published_time") ??
    /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1] ??
    /<time[^>]+datetime=["']([^"']+)["']/i.exec(html)?.[1] ??
    null;
  const publishedAt = published && Number.isFinite(Date.parse(published)) ? published : null;
  return { title: title || null, description: description || null, publishedAt };
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

export async function isAllowed(url: string): Promise<boolean> {
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
