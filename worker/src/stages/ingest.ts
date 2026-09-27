import { createServiceRoleClient, type LimitsConfig } from "@dailydigest/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExaResults } from "../connectors/exa.js";
import { fetchGdeltArticles } from "../connectors/gdelt.js";
import { fetchOpenAlexWorksByIssn } from "../connectors/openalex.js";
import { fetchRssFeed } from "../connectors/rss.js";
import type { Env } from "../env.js";
import { claimJobs, completeJob, enqueueJobs, failJob, type JobRow } from "../jobs.js";
import { canonicalizeUrl } from "../lib/canonicalUrl.js";

const CLAIM_BATCH_SIZE = 10;
const OPENALEX_INITIAL_LOOKBACK_DAYS = 90;
const OPENALEX_OVERLAP_DAYS = 3;

interface SourceRow {
  id: string;
  name: string;
  type: string;
  url_or_query: string | null;
  language: string | null;
  last_fetched_at: string | null;
  paywalled: boolean;
}

/**
 * SPEC.md section 6.1: "fetch window since last successful run plus
 * overlap". Academic journals publish rarely, so a same-day filter would
 * always return nothing — this falls back to a longer lookback window on
 * a source's first run.
 */
function openAlexSinceDate(source: SourceRow): string {
  const base = source.last_fetched_at
    ? new Date(source.last_fetched_at)
    : new Date(Date.now() - OPENALEX_INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  base.setDate(base.getDate() - OPENALEX_OVERLAP_DAYS);
  return base.toISOString().slice(0, 10);
}

async function recordSourceHealth(
  db: SupabaseClient,
  sourceId: string,
  ok: boolean,
): Promise<void> {
  if (ok) {
    await db
      .from("sources")
      .update({ last_fetched_at: new Date().toISOString(), error_count: 0, health_status: "ok" })
      .eq("id", sourceId);
    return;
  }
  const { data } = await db.from("sources").select("error_count").eq("id", sourceId).single();
  const errorCount = (data?.error_count ?? 0) + 1;
  await db
    .from("sources")
    .update({
      error_count: errorCount,
      health_status: errorCount >= 3 ? "broken" : "degraded",
    })
    .eq("id", sourceId);
}

async function insertItems(
  db: SupabaseClient,
  ownerId: string,
  sourceId: string,
  rows: {
    url: string;
    title: string;
    standfirst?: string | null;
    author?: string | null;
    publishedAt?: string | null;
    language?: string | null;
    paywalled?: boolean;
    raw?: unknown;
  }[],
  maxItems: number,
): Promise<{ id: string; canonical_url: string }[]> {
  const capped = rows.slice(0, maxItems);
  const payload = capped
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
        status: "new",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (payload.length === 0) return [];

  const { data, error } = await db
    .from("items")
    .upsert(payload, { onConflict: "owner_id,canonical_url", ignoreDuplicates: true })
    .select("id, canonical_url");
  if (error) throw new Error(`Failed to insert items: ${error.message}`);
  return data ?? [];
}

async function processRssJob(db: SupabaseClient, env: Env, limits: LimitsConfig, source: SourceRow) {
  if (!source.url_or_query) {
    console.warn(`ingest: source "${source.name}" has no feed url yet, skipping`);
    return;
  }
  const items = await fetchRssFeed(source.url_or_query);
  await insertItems(
    db,
    env.OWNER_ID,
    source.id,
    items.map((item) => ({
      url: item.url,
      title: item.title,
      standfirst: item.standfirst,
      author: item.author,
      publishedAt: item.publishedAt,
      language: source.language,
      paywalled: source.paywalled,
    })),
    limits.max_items_per_source_per_run,
  );
  await recordSourceHealth(db, source.id, true);
}

async function processOpenAlexJob(db: SupabaseClient, env: Env, limits: LimitsConfig, source: SourceRow) {
  if (!source.url_or_query) {
    console.warn(`ingest: openalex source "${source.name}" has no issn yet, skipping`);
    return;
  }
  const works = await fetchOpenAlexWorksByIssn(source.url_or_query, openAlexSinceDate(source));
  const inserted = await insertItems(
    db,
    env.OWNER_ID,
    source.id,
    works.map((work) => ({
      url: work.url,
      title: work.title,
      standfirst: work.abstract,
      author: work.authors.join(", "),
      publishedAt: work.publishedAt,
      language: "en",
      raw: work,
    })),
    limits.max_items_per_source_per_run,
  );

  if (inserted.length > 0) {
    const byUrl = new Map(works.map((w) => [canonicalizeUrl(w.url), w]));
    const researchRows = inserted
      .map((row) => {
        const work = byUrl.get(row.canonical_url);
        if (!work) return null;
        return {
          owner_id: env.OWNER_ID,
          item_id: row.id,
          openalex_id: work.openalexId,
          doi: work.doi,
          journal: work.journal,
          authors: work.authors,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (researchRows.length > 0) {
      const { error } = await db.from("research_items").upsert(researchRows, { onConflict: "item_id" });
      if (error) throw new Error(`Failed to insert research_items: ${error.message}`);
    }
  }
  await recordSourceHealth(db, source.id, true);
}

async function processGdeltJob(db: SupabaseClient, env: Env, limits: LimitsConfig, sourceId: string, query: string) {
  const articles = await fetchGdeltArticles(query);
  await insertItems(
    db,
    env.OWNER_ID,
    sourceId,
    articles.map((article) => ({
      url: article.url,
      title: article.title,
      publishedAt: article.publishedAt,
      language: article.language,
    })),
    limits.max_items_per_source_per_run,
  );
}

async function processExaJob(db: SupabaseClient, env: Env, limits: LimitsConfig, sourceId: string, query: string) {
  if (!env.EXA_API_KEY) {
    console.warn("ingest: EXA_API_KEY not set, skipping exa job");
    return;
  }
  const results = await fetchExaResults(env.EXA_API_KEY, query);
  await insertItems(
    db,
    env.OWNER_ID,
    sourceId,
    results.map((result) => ({
      url: result.url,
      title: result.title,
      author: result.author,
      publishedAt: result.publishedAt,
    })),
    limits.max_items_per_source_per_run,
  );
}

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
    .select("id, name, type, url_or_query, language, last_fetched_at, paywalled")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true)
    .in("type", ["rss", "api_openalex", "api_exa", "api_gdelt"]);
  if (sourcesError) throw new Error(`Failed to load sources: ${sourcesError.message}`);

  const { data: topics, error: topicsError } = await db
    .from("topics")
    .select("id, queries_en")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);
  if (topicsError) throw new Error(`Failed to load topics: ${topicsError.message}`);

  const rssAndOpenAlexSources = (sources ?? []).filter((s) => s.type === "rss" || s.type === "api_openalex");
  const gdeltSource = (sources ?? []).find((s) => s.type === "api_gdelt");
  const exaSource = (sources ?? []).find((s) => s.type === "api_exa");

  const payloads: Record<string, unknown>[] = rssAndOpenAlexSources.map((s) => ({
    kind: s.type,
    sourceId: s.id,
  }));

  for (const topic of topics ?? []) {
    const query = (topic.queries_en as string[] | null)?.[0];
    if (!query) continue;
    if (gdeltSource) payloads.push({ kind: "gdelt", sourceId: gdeltSource.id, topicId: topic.id, query });
    if (exaSource) payloads.push({ kind: "exa", sourceId: exaSource.id, topicId: topic.id, query });
  }

  await enqueueJobs(db, { ownerId: env.OWNER_ID, runId: run.id, stage: "ingest", payloads });

  const sourceById = new Map((sources ?? []).map((s) => [s.id, s as SourceRow]));
  let processed = 0;
  let failed = 0;

  while (true) {
    const jobs: JobRow[] = await claimJobs(db, { ownerId: env.OWNER_ID, stage: "ingest", limit: CLAIM_BATCH_SIZE });
    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        const payload = job.payload as {
          kind: string;
          sourceId: string;
          query?: string;
        };
        const source = sourceById.get(payload.sourceId);

        if (payload.kind === "rss" && source) {
          await processRssJob(db, env, limits, source);
        } else if (payload.kind === "api_openalex" && source) {
          await processOpenAlexJob(db, env, limits, source);
        } else if (payload.kind === "gdelt" && payload.query) {
          await processGdeltJob(db, env, limits, payload.sourceId, payload.query);
        } else if (payload.kind === "exa" && payload.query) {
          await processExaJob(db, env, limits, payload.sourceId, payload.query);
        }

        await completeJob(db, job.id);
        processed++;
      } catch (err) {
        console.error(`ingest job ${job.id} failed:`, (err as Error).message);
        if (job.payload && typeof job.payload === "object" && "sourceId" in job.payload) {
          await recordSourceHealth(db, (job.payload as { sourceId: string }).sourceId, false).catch(() => {});
        }
        await failJob(db, job, err);
        failed++;
      }
    }
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "ok",
      stats: { stage: "ingest", date, processed, failed },
    })
    .eq("id", run.id);

  console.log(`ingest stage done: ${processed} jobs processed, ${failed} failed`);
}
