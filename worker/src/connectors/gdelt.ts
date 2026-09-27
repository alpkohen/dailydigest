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

/**
 * GDELT DOC 2.0 API, queried per topic (SPEC.md section 4.5: "broad and
 * regional press coverage"). No API key required.
 */
export async function fetchGdeltArticles(query: string, timespan = "1d"): Promise<GdeltArticle[]> {
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
  const body = (await response.json()) as { articles?: GdeltApiArticle[] };

  return (body.articles ?? []).map((article) => ({
    title: article.title,
    url: article.url,
    publishedAt: article.seendate ?? null,
    language: article.language ?? null,
    sourceCountry: article.sourcecountry ?? null,
  }));
}
