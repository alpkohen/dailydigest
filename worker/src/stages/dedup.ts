import { createServiceRoleClient, type LimitsConfig } from "@dailydigest/db";
import type { Env } from "../env.js";
import { findCanonicalMatch, toUnitVector, type DedupCandidate } from "../lib/dedup.js";
import { runPool } from "../lib/pool.js";
import { parseEmbedding } from "../lib/vector.js";

const LINK_CONCURRENCY = 10;

const WINDOW_MS = 48 * 60 * 60 * 1000;
// Each row carries a full embedding vector (1024 floats). At 1000/page that
// serializes to tens of MB of JSON per request - observed live on
// 2026-10-01 timing out ("canceling statement due to statement timeout")
// once a multi-day backlog pushed the candidate count past 5000, and still
// not finished after 55+ minutes on a retry with no timeout. The pairwise
// comparison itself (findCanonicalMatch) is cheap even at that scale - this
// is a fetch-size problem, not an algorithmic one. Smaller pages trade more
// round trips for a payload Postgres/PostgREST can actually serialize and
// transfer within a normal statement timeout.
const PAGE_SIZE = 200;

interface ItemRow {
  id: string;
  published_at: string | null;
  created_at: string;
  simhash: string | null;
  embedding: unknown;
}

/**
 * Near-duplicate linking (SPEC.md section 6, stage 4). Processes items in
 * publication order so the earliest copy of a wire story is always the
 * canonical one; later copies get canonical_item_id set and stay queryable
 * (rows are never deleted, per rule 6 — nothing here removes data).
 */
export async function runDedupStage(env: Env, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "dedup", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const rows: ItemRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("items")
      .select("id, published_at, created_at, simhash, embedding")
      .eq("owner_id", env.OWNER_ID)
      .eq("status", "embedded")
      .is("canonical_item_id", null)
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load embedded items: ${error.message}`);
    rows.push(...((data ?? []) as ItemRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const candidates: DedupCandidate[] = rows
    .map((row) => ({
      id: row.id,
      publishedAt: Date.parse(row.published_at ?? row.created_at),
      simhash: row.simhash,
      embedding: parseEmbedding(row.embedding),
      unit: toUnitVector(parseEmbedding(row.embedding)),
    }))
    .sort((a, b) => a.publishedAt - b.publishedAt);

  const canonicalPool: DedupCandidate[] = [];
  const duplicateLinks: { id: string; canonicalId: string }[] = [];

  // Candidates are in publication order, so a pool entry too old for this
  // candidate is too old for every later one: the cutoff only moves forward.
  let poolStart = 0;
  for (const candidate of candidates) {
    while (poolStart < canonicalPool.length && canonicalPool[poolStart]!.publishedAt < candidate.publishedAt - WINDOW_MS) poolStart++;
    const matchId = findCanonicalMatch(
      candidate,
      canonicalPool,
      WINDOW_MS,
      limits.thresholds.dedup_simhash_distance,
      limits.thresholds.dedup_cosine,
      poolStart,
    );
    if (matchId) {
      duplicateLinks.push({ id: candidate.id, canonicalId: matchId });
    } else {
      canonicalPool.push(candidate);
    }
  }

  await runPool(duplicateLinks, LINK_CONCURRENCY, async (link) => {
    // Status is left untouched: relevance scoring (stage 5) filters on
    // canonical_item_id is null, which already excludes duplicates.
    const { error } = await db
      .from("items")
      .update({ canonical_item_id: link.canonicalId })
      .eq("id", link.id);
    if (error) console.error(`dedup: failed to link ${link.id} -> ${link.canonicalId}: ${error.message}`);
  });

  await db
    .from("pipeline_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: "ok",
      stats: { stage: "dedup", date, checked: candidates.length, duplicatesLinked: duplicateLinks.length },
    })
    .eq("id", run.id);

  console.log(`dedup stage done: ${duplicateLinks.length} duplicates linked out of ${candidates.length} checked`);
}
