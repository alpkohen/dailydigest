import { createServiceRoleClient, type LimitsConfig } from "@dailydigest/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExaResults } from "../connectors/exa.js";
import { fetchGdeltArticles } from "../connectors/gdelt.js";
import { fetchOpenAlexWorksByIssn } from "../connectors/openalex.js";
import { fetchRssFeed } from "../connectors/rss.js";
import { fetchListingItems } from "../connectors/listing.js";
import { fetchSitemapItems } from "../connectors/sitemap.js";
import type { Env } from "../env.js";
import { canonicalizeUrl } from "../lib/canonicalUrl.js";

const OPENALEX_INITIAL_LOOKBACK_DAYS = 90;
const OPENALEX_OVERLAP_DAYS = 3;
const SOURCE_TIMEOUT_MS = 45_000;
// A feed only exposes its latest N entries. If every entry in a fetch is
// new and there are this many, older ones may have scrolled off the feed
// since the last run: flagged so the owner can see a possible gap.
const GAP_SUSPECT_MIN_ITEMS = 20;
// A feed that answers but whose newest entry is this old has quietly stopped
// updating (seen live: CSIS's feed still serves 2016 posts). Reported as
// degraded rather than ok, so it shows up as a coverage problem.
const STALE_FEED_DAYS = 21;

function isStale(items: ItemInput[]): boolean {
  if (items.length === 0) return true;
  const newest = items
    .map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .reduce((max, t) => Math.max(max, t), 0);
  // Feeds without dates can't be judged stale.
  if (newest === 0) return false;
  return Date.now() - newest > STALE_FEED_DAYS * 24 * 60 * 60 * 1000;
}

interface SourceRow {
  id: string;
  name: string;
  type: string;
  url_or_query: string | null;
  language: string | null;
  last_fetched_at: string | null;
  paywalled: boolean;
  link_pattern: string | null;
}

interface ItemInput {
  url: string;
  title: string;
  standfirst?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  paywalled?: boolean;
  raw?: unknown;
  /** Defaults to "new". Older articles found on a web page are stored as
   * already unmatched, so they're known and searchable but don't land in
   * today's feed. */
  status?: "new" | "not_relevant";
}

function openAlexSinceDate(source: SourceRow): string {
  const base = source.last_fetched_at
    ? new Date(source.last_fetched_at)
    : new Date(Date.now() - OPENALEX_INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  base.setDate(base.getDate() - OPENALEX_OVERLAP_DAYS);
  return base.toISOString().slice(0, 10);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function recordSourceHealth(db: SupabaseClient, sourceId: string, ok: boolean, stale = false): Promise<void> {
  if (ok) {
    await db
      .from("sources")
      .update({ last_fetched_at: new Date().toISOString(), error_count: 0, health_status: stale ? "degraded" : "ok" })
      .eq("id", sourceId);
    return;
  }
  const { data } = await db.from("sources").select("error_count").eq("id", sourceId).single();
  const errorCount = (data?.error_count ?? 0) + 1;
  await db
    .from("sources")
    .update({ error_count: errorCount, health_status: errorCount >= 3 ? "broken" : "degraded" })
    .eq("id", sourceId);
}

async function insertItems(
  db: SupabaseClient,
  ownerId: string,
  sourceId: string,
  rows: ItemInput[],
  maxItems: number,
): Promise<{ id: string; canonical_url: string }[]> {
  const payload = rows
    .slice(0, maxItems)
    .map((row) => {
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(row.url);
      } catch {
        return null;
      }
      return {
        owner_id: ownerId,
        source_id: sourceId,
        canonical_url: canonicalUrl,
        url: row.url,
        title: row.title,
        standfirst: row.standfirst ?? null,
        author: row.author ?? null,
        published_at: row.publishedAt ?? null,
        language: row.language ?? null,
        paywalled: row.paywalled ?? false,
        raw: row.raw ?? null,
        status: row.status ?? "new",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null && Boolean(row.title));

  if (payload.length === 0) return [];

  const { data, error } = await db
    .from("items")
    .upsert(payload, { onConflict: "owner_id,canonical_url", ignoreDuplicates: true })
    .select("id, canonical_url");
  if (error) throw new Error(`Failed to insert items: ${error.message}`);
  return data ?? [];
}

const SITEMAP_WINDOW_DAYS = 3;
// A listing page shows its latest N articles regardless of age; on a
// source's first run, the older ones are stored as already unmatched.
const LISTING_FRESH_DAYS = 7;

/** Which of these URLs are already stored, so sitemap pages are fetched once. */
async function knownUrls(db: SupabaseClient, ownerId: string, urls: string[]): Promise<Set<string>> {
  const byCanonical = new Map<string, string>();
  for (const url of urls) {
    try {
      byCanonical.set(canonicalizeUrl(url), url);
    } catch {
      // Unparseable URLs are simply treated as unknown.
    }
  }
  const canonical = [...byCanonical.keys()];
  const known = new Set<string>();
  for (let i = 0; i < canonical.length; i += 100) {
    const { data, error } = await db
      .from("items")
      .select("canonical_url")
      .eq("owner_id", ownerId)
      .in("canonical_url", canonical.slice(i, i + 100));
    if (error) throw new Error(`Failed to check known urls: ${error.message}`);
    for (const row of data ?? []) known.add(byCanonical.get(row.canonical_url as string)!);
  }
  return known;
}

async function fetchSource(
  db: SupabaseClient,
  ownerId: string,
  source: SourceRow,
): Promise<{ items: ItemInput[]; research?: Awaited<ReturnType<typeof fetchOpenAlexWorksByIssn>> }> {
  if (!source.url_or_query) return { items: [] };
  if (source.type === "scrape") {
    if (!source.link_pattern) throw new Error("listing source has no link_pattern");
    const items = await fetchListingItems(source.url_or_query, source.link_pattern, (urls) => knownUrls(db, ownerId, urls));
    const cutoff = Date.now() - LISTING_FRESH_DAYS * 24 * 60 * 60 * 1000;
    return {
      items: items.map((item) => ({
        url: item.url,
        title: item.title,
        standfirst: item.standfirst,
        publishedAt: item.publishedAt,
        language: source.language,
        paywalled: source.paywalled,
        status: item.publishedAt && Date.parse(item.publishedAt) < cutoff ? "not_relevant" : "new",
      })),
    };
  }
  if (source.type === "sitemap") {
    const items = await fetchSitemapItems(source.url_or_query, SITEMAP_WINDOW_DAYS, (urls) => knownUrls(db, ownerId, urls));
    return {
      items: items.map((item) => ({
        url: item.url,
        title: item.title,
        standfirst: item.standfirst,
        publishedAt: item.publishedAt,
        language: source.language,
        paywalled: source.paywalled,
      })),
    };
  }
  if (source.type === "rss") {
    const items = await fetchRssFeed(source.url_or_query);
    return {
      items: items.map((item) => ({
        url: item.url,
        title: item.title,
        standfirst: item.standfirst,
        author: item.author,
        publishedAt: item.publishedAt,
        language: source.language,
        paywalled: source.paywalled,
      })),
    };
  }
  const works = await fetchOpenAlexWorksByIssn(source.url_or_query, openAlexSinceDate(source));
  return {
    items: works.map((work) => ({
      url: work.url,
      title: work.title,
      standfirst: work.abstract,
      author: work.authors.join(", "),
      publishedAt: work.publishedAt,
      language: "en",
      raw: work,
    })),
    research: works,
  };
}

async function linkResearchItems(
  db: SupabaseClient,
  ownerId: string,
  inserted: { id: string; canonical_url: string }[],
  works: Awaited<ReturnType<typeof fetchOpenAlexWorksByIssn>>,
): Promise<void> {
  const byUrl = new Map(works.map((w) => [canonicalizeUrl(w.url), w]));
  const rows = inserted
    .map((row) => {
      const work = byUrl.get(row.canonical_url);
      if (!work) return null;
      return {
        owner_id: ownerId,
        item_id: row.id,
        openalex_id: work.openalexId,
        doi: work.doi,
        journal: work.journal,
        authors: work.authors,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return;
  const { error } = await db.from("research_items").upsert(rows, { onConflict: "item_id" });
  if (error) throw new Error(`Failed to insert research_items: ${error.message}`);
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Ingest: fetch every active configured source (RSS feeds and OpenAlex
 * journals), store each entry's feed metadata, and record per-source health.
 * No job queue: sources are fetched directly with bounded concurrency and a
 * per-source timeout, so one slow or dead source can't stall the run.
 */
export async function runIngestStage(env: Env, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "ingest", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: sources, error: sourcesError } = await db
    .from("sources")
    .select("id, name, type, url_or_query, language, last_fetched_at, paywalled, link_pattern")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true)
    .in("type", ["rss", "sitemap", "scrape", "api_openalex"]);
  if (sourcesError) throw new Error(`Failed to load sources: ${sourcesError.message}`);

  // A source with no feed URL can never deliver: count it as failing so it
  // shows in the health report instead of being silently skipped.
  const unconfigured = ((sources ?? []) as SourceRow[]).filter((s) => !s.url_or_query);
  for (const source of unconfigured) {
    await db.from("sources").update({ health_status: "broken" }).eq("id", source.id);
  }

  let inserted = 0;
  const failedSources: string[] = [];
  const gapSuspects: string[] = [];
  const staleSources: string[] = [];

  const configured = ((sources ?? []) as SourceRow[]).filter((s) => s.url_or_query);
  await mapWithConcurrency(configured, limits.pipeline.ingest_concurrency, async (source) => {
    try {
      const fetched = await withTimeout(fetchSource(db, env.OWNER_ID, source), SOURCE_TIMEOUT_MS, source.name);
      const rows = await insertItems(db, env.OWNER_ID, source.id, fetched.items, limits.max_items_per_source_per_run);
      if (fetched.research && rows.length > 0) await linkResearchItems(db, env.OWNER_ID, rows, fetched.research);
      inserted += rows.length;
      // Sitemaps return only new entries by design, so "all new" is normal there.
      if (source.type === "rss" && source.last_fetched_at && rows.length >= GAP_SUSPECT_MIN_ITEMS && rows.length === fetched.items.length) {
        gapSuspects.push(source.name);
      }
      // OpenAlex journals publish rarely and sitemaps return only new
      // entries; only feeds are judged stale.
      const stale = source.type === "rss" && isStale(fetched.items);
      if (stale) staleSources.push(source.name);
      await recordSourceHealth(db, source.id, true, stale);
    } catch (err) {
      failedSources.push(source.name);
      console.error(`ingest: ${source.name} failed: ${(err as Error).message}`);
      await recordSourceHealth(db, source.id, false).catch(() => {});
    }
  });

  if (limits.pipeline.use_search_apis) await runSearchApiExpansion(db, env, limits);

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: failedSources.length > 0 ? "partial" : "ok",
      stats: {
        stage: "ingest",
        date,
        sources: sources?.length ?? 0,
        inserted,
        failed: failedSources.length,
        failedSources,
        gapSuspects,
        staleSources,
        unconfigured: unconfigured.map((s) => s.name),
      },
    })
    .eq("id", run.id);

  console.log(
    `ingest stage done: ${sources?.length ?? 0} sources, ${inserted} new items, ${failedSources.length} failed` +
      (gapSuspects.length ? `, possible feed gaps: ${gapSuspects.join(", ")}` : ""),
  );
}

/** Optional GDELT/Exa expansion by topic query (limits.yaml pipeline.use_search_apis). */
async function runSearchApiExpansion(db: SupabaseClient, env: Env, limits: LimitsConfig): Promise<void> {
  const { data: apiSources } = await db
    .from("sources")
    .select("id, type")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true)
    .in("type", ["api_gdelt", "api_exa"]);
  const { data: topics } = await db
    .from("topics")
    .select("queries_tr, queries_en")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);

  for (const topic of topics ?? []) {
    const queries = new Set([...((topic.queries_tr as string[]) ?? []), ...((topic.queries_en as string[]) ?? [])]);
    for (const query of queries) {
      for (const source of apiSources ?? []) {
        try {
          const rows: ItemInput[] =
            source.type === "api_gdelt"
              ? (await fetchGdeltArticles(query)).map((a) => ({ url: a.url, title: a.title, publishedAt: a.publishedAt, language: a.language }))
              : env.EXA_API_KEY
                ? (await fetchExaResults(env.EXA_API_KEY, query)).map((r) => ({ url: r.url, title: r.title, author: r.author, publishedAt: r.publishedAt }))
                : [];
          await insertItems(db, env.OWNER_ID, source.id, rows, limits.max_items_per_source_per_run);
        } catch (err) {
          console.error(`ingest: ${source.type} "${query}" failed: ${(err as Error).message}`);
        }
      }
    }
  }
}
