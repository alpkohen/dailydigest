import { createServiceRoleClient } from "@dailydigest/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";
import { claimJobs, completeJob, enqueueJobs, failJob, type JobRow } from "../jobs.js";
import { computeSimhash, textHash, weightedSimhashInput } from "../lib/hash.js";
import { detectLanguage } from "../lib/language.js";
import { ParsePool } from "../lib/parsePool.js";
import { sanitizeForPostgres } from "../lib/sanitize.js";

const CLAIM_BATCH_SIZE = 5;
const ITEMS_PER_JOB = 20;
const FETCH_TIMEOUT_MS = 15_000;
// No real article is this long; anything past it is almost certainly a
// parsing failure on non-article content, so it's dropped rather than
// stored (defense in depth alongside the content-type check above).
const MAX_TEXT_LENGTH = 100_000;
// JSDOM/Readability parse synchronously with no timeout of their own -
// a single pathological or oversized document can block the event loop
// for a very long time with nothing else able to run meanwhile (observed
// live: a whole extract run stalled indefinitely on one such item, with
// zero items processed for 15+ minutes). Reject oversized HTML before it
// ever reaches JSDOM rather than relying on the post-parse text length
// check, which only applies once the (possibly very slow) parse is done.
const MAX_HTML_LENGTH = 2_000_000;
// Parsing now happens in worker threads (lib/parsePool.ts) specifically so a
// hang like the one above - whatever causes the *next* one, not just the
// CSS case already patched - can be killed on a timeout instead of freezing
// the whole stage for a full 3-hour job timeout, as happened live on
// 2026-10-01. Pool size is small and fixed: parsing is CPU-bound, so more
// workers than cores just adds contention, not throughput.
const PARSE_POOL_SIZE = 4;

interface ItemRow {
  id: string;
  url: string;
  title: string;
  paywalled: boolean;
  language: string | null;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (dailydigest personal use)" },
    });
    if (!response.ok) throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("xml") && contentType !== "") {
      // Readability/JSDOM only make sense for markup; feeding them a PDF or
      // other binary produces enormous, meaningless "text" (seen in
      // practice: multi-megabyte garbage from PDF responses).
      throw new Error(`not HTML (content-type: ${contentType})`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Full-text extraction for non-paywalled items via Readability, language
 * detection, and text_hash/simhash computation (SPEC.md section 6, stage 2
 * "Extract"; rule 6: paywalled items keep title/standfirst/metadata only).
 */
async function extractOne(db: SupabaseClient, pool: ParsePool, item: ItemRow): Promise<void> {
  if (item.paywalled) {
    await db.from("items").update({ status: "extracted" }).eq("id", item.id);
    return;
  }

  let text: string | null = null;
  try {
    const html = await fetchHtml(item.url);
    if (html.length > MAX_HTML_LENGTH) throw new Error(`html too large (${html.length} bytes), skipping parse`);
    const extracted = await pool.parse(html, item.url);
    // Sanitize before the length check too: a source's garbled encoding can
    // produce \u0000/unpaired surrogates that Postgres rejects outright
    // (code-review finding: this write was unguarded, and with items now
    // processed 25-at-a-time via Promise.all, one poisoned item's crash
    // used to take its whole concurrent batch down with it).
    const cleaned = extracted ? sanitizeForPostgres(extracted) : null;
    text = cleaned && cleaned.length <= MAX_TEXT_LENGTH ? cleaned : null;
  } catch (err) {
    console.warn(`extract: could not fetch/parse ${item.url}: ${(err as Error).message}`);
  }

  const language = item.language ?? detectLanguage(text ?? item.title);

  try {
    await db
      .from("items")
      .update({
        text,
        language,
        text_hash: text ? textHash(text) : null,
        simhash: text ? computeSimhash(weightedSimhashInput(item.title, text)) : null,
        status: "extracted",
      })
      .eq("id", item.id);
  } catch (err) {
    // Sanitizing text should prevent this, but the write itself is still
    // unguarded against any other per-item failure - and since this runs
    // inside a Promise.all with 24 siblings, an uncaught throw here used
    // to fail their whole shared job (retried up to 3x, always on the
    // same poisoned item, permanently losing every item in that batch).
    // Fall back to a metadata-only extraction rather than let one item
    // take its neighbours down.
    console.warn(`extract: failed to store extracted text for ${item.id}, falling back to metadata only: ${(err as Error).message}`);
    await db.from("items").update({ text: null, language, status: "extracted" }).eq("id", item.id);
  }
}

export async function runExtractStage(env: Env, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "extract", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  // PostgREST caps a single select at 1000 rows by default, so this pages
  // through until a page comes back short.
  const newItemIds: string[] = [];
  const PAGE_SIZE = 1000;
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id")
      .eq("owner_id", env.OWNER_ID)
      .eq("status", "new")
      .is("canonical_item_id", null)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load new items: ${error.message}`);
    newItemIds.push(...(data ?? []).map((r) => r.id));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const batches: string[][] = [];
  for (let i = 0; i < newItemIds.length; i += ITEMS_PER_JOB) {
    batches.push(newItemIds.slice(i, i + ITEMS_PER_JOB));
  }
  await enqueueJobs(db, {
    ownerId: env.OWNER_ID,
    runId: run.id,
    stage: "extract",
    payloads: batches.map((itemIds) => ({ itemIds })),
  });

  let processed = 0;
  let failed = 0;
  const pool = new ParsePool(PARSE_POOL_SIZE);

  try {
    while (true) {
      const jobs: JobRow[] = await claimJobs(db, { ownerId: env.OWNER_ID, stage: "extract", limit: CLAIM_BATCH_SIZE });
      if (jobs.length === 0) break;

      for (const job of jobs) {
        try {
          const itemIds = (job.payload as { itemIds: string[] }).itemIds ?? [];
          const { data: items, error } = await db
            .from("items")
            .select("id, url, title, paywalled, language")
            .eq("owner_id", env.OWNER_ID)
            .in("id", itemIds);
          if (error) throw new Error(error.message);

          // Each item is an independent network fetch + parse; running them
          // one at a time made a 1000+ item day take well over an hour.
          // Small fixed concurrency keeps memory/CPU (JSDOM per item) bounded
          // while cutting wall time roughly proportionally.
          // Sources produce 1500-3000 new items on a typical day (confirmed
          // live: 4 consecutive days all in that range, not a one-off spike).
          // These are I/O-bound network fetches, not CPU-bound, so a much
          // higher concurrency than the CLAIM_BATCH_SIZE/ITEMS_PER_JOB knobs
          // suggest is safe and needed to clear that volume in reasonable time.
          const ITEM_CONCURRENCY = 25;
          const itemsToProcess = (items ?? []) as ItemRow[];
          for (let i = 0; i < itemsToProcess.length; i += ITEM_CONCURRENCY) {
            await Promise.all(itemsToProcess.slice(i, i + ITEM_CONCURRENCY).map((item) => extractOne(db, pool, item)));
          }

          await completeJob(db, job.id);
          processed++;
        } catch (err) {
          console.error(`extract job ${job.id} failed:`, (err as Error).message);
          await failJob(db, job, err);
          failed++;
        }
      }
    }
  } finally {
    await pool.destroy();
  }

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: failed > 0 ? "partial" : "ok",
      stats: { stage: "extract", date, processed, failed },
    })
    .eq("id", run.id);

  console.log(`extract stage done: ${processed} batches processed, ${failed} failed`);
}
