export interface ExaResult {
  title: string;
  url: string;
  publishedAt: string | null;
  author: string | null;
}

interface ExaApiResult {
  title: string | null;
  url: string;
  publishedDate: string | null;
  author: string | null;
}

/**
 * Exa semantic search per topic query (SPEC.md section 4.5: "analysis
 * pieces outside the registry"). Requires EXA_API_KEY.
 */
export async function fetchExaResults(apiKey: string, query: string): Promise<ExaResult[]> {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      query,
      numResults: 25,
      type: "auto",
      startPublishedDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }),
  });
  if (!response.ok) {
    throw new Error(`Exa request failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { results: ExaApiResult[] };

  return body.results.map((result) => ({
    title: result.title ?? "(untitled)",
    url: result.url,
    publishedAt: result.publishedDate,
    author: result.author,
  }));
}
