import { createServiceRoleClient } from "@dailydigest/db";
import { Readability } from "@mozilla/readability";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import type { Env } from "../env.js";
import { claimJobs, completeJob, enqueueJobs, failJob, type JobRow } from "../jobs.js";
import { computeSimhash, textHash, weightedSimhashInput } from "../lib/hash.js";
import { detectLanguage } from "../lib/language.js";

const CLAIM_BATCH_SIZE = 5;
const ITEMS_PER_JOB = 20;
const FETCH_TIMEOUT_MS = 15_000;
// No real article is this long; anything past it is almost certainly a
// parsing failure on non-article content, so it's dropped rather than
// stored (defense in depth alongside the content-type check above).
const MAX_TEXT_LENGTH = 100_000;

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
async function extractOne(db: SupabaseClient, item: ItemRow): Promise<void> {
  if (item.paywalled) {
    await db.from("items").update({ status: "extracted" }).eq("id", item.id);
    return;
  }

  let text: string | null = null;
  try {
    const html = await fetchHtml(item.url);
    const dom = new JSDOM(html, { url: item.url });
    const article = new Readability(dom.window.document).parse();
    const extracted = article?.textContent?.trim() || null;
    text = extracted && extracted.length <= MAX_TEXT_LENGTH ? extracted : null;
  } catch (err) {
    console.warn(`extract: could not fetch/parse ${item.url}: ${(err as Error).message}`);
  }

  const language = item.language ?? detectLanguage(text ?? item.title);

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

        for (const item of (items ?? []) as ItemRow[]) {
          await extractOne(db, item);
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
