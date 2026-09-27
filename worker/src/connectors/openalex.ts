export interface OpenAlexWork {
  openalexId: string;
  doi: string | null;
  title: string;
  url: string;
  journal: string | null;
  authors: string[];
  abstract: string | null;
  publishedAt: string | null;
}

interface OpenAlexApiWork {
  id: string;
  doi: string | null;
  title: string | null;
  display_name: string | null;
  publication_date: string | null;
  primary_location?: { source?: { display_name?: string } };
  authorships?: { author: { display_name: string } }[];
  abstract_inverted_index?: Record<string, number[]>;
}

function reconstructAbstract(index: Record<string, number[]> | undefined): string | null {
  if (!index) return null;
  const positions: string[] = [];
  for (const [word, occurrences] of Object.entries(index)) {
    for (const pos of occurrences) positions[pos] = word;
  }
  const text = positions.filter(Boolean).join(" ");
  return text.length > 0 ? text : null;
}

/**
 * Fetches new works for a journal (by ISSN) since a date (SPEC.md section
 * 4.5: OpenAlex by journal, watched author, etc; section 6.1: fetch window
 * since last successful run plus overlap). No API key required.
 */
export async function fetchOpenAlexWorksByIssn(issn: string, sinceDate: string): Promise<OpenAlexWork[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set(
    "filter",
    `primary_location.source.issn:${issn},from_publication_date:${sinceDate}`,
  );
  url.searchParams.set("per-page", "50");
  url.searchParams.set("sort", "publication_date:desc");

  const response = await fetch(url, { headers: { "User-Agent": "dailydigest (personal use)" } });
  if (!response.ok) {
    throw new Error(`OpenAlex request failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { results: OpenAlexApiWork[] };

  return body.results.map((work) => ({
    openalexId: work.id,
    doi: work.doi,
    title: work.title ?? work.display_name ?? "(untitled)",
    url: work.doi ?? work.id,
    journal: work.primary_location?.source?.display_name ?? null,
    authors: (work.authorships ?? []).map((a) => a.author.display_name),
    abstract: reconstructAbstract(work.abstract_inverted_index),
    publishedAt: work.publication_date,
  }));
}
