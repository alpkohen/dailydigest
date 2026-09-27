export interface GdeltArticle {
  title: string;
  url: string;
  publishedAt: string | null;
  language: string | null;
  sourceCountry: string | null;
}

interface GdeltApiArticle {
  title: string;
  url: string;
  seendate: string;
  language: string;
  sourcecountry: string;
}

// GDELT asks for at most one request every 5 seconds (seen in practice: a
// burst of calls, one per topic/watch, gets a plain-text rate-limit notice
// back instead of JSON). Every call in this process shares one throttle so
// callers don't need to know about it.
const MIN_INTERVAL_MS = 5_100;
let lastCallAt = 0;

async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

/**
 * GDELT DOC 2.0 API, queried per topic (SPEC.md section 4.5: "broad and
 * regional press coverage"). No API key required.
 */
export async function fetchGdeltArticles(query: string, timespan = "1d"): Promise<GdeltArticle[]> {
  await throttle();

  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "75");
  url.searchParams.set("timespan", timespan);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GDELT request failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  let body: { articles?: GdeltApiArticle[] };
  try {
    body = JSON.parse(text);
  } catch {
    // GDELT returns a plain-text rate-limit notice (still HTTP 200) instead
    // of JSON when called too often.
    throw new Error(`GDELT did not return JSON (likely rate limited): ${text.slice(0, 120)}`);
  }

  return (body.articles ?? []).map((article) => ({
    title: article.title,
    url: article.url,
    publishedAt: article.seendate ?? null,
    language: article.language ?? null,
    sourceCountry: article.sourcecountry ?? null,
  }));
}
