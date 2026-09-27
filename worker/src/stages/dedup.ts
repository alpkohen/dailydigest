import { createServiceRoleClient, type LimitsConfig } from "@dailydigest/db";
import type { Env } from "../env.js";
import { findCanonicalMatch, type DedupCandidate } from "../lib/dedup.js";

const WINDOW_MS = 48 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

interface ItemRow {
  id: string;
  published_at: string | null;
  created_at: string;
  simhash: string | null;
  embedding: number[] | null;
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
      embedding: row.embedding,
    }))
    .sort((a, b) => a.publishedAt - b.publishedAt);

  const canonicalPool: DedupCandidate[] = [];
  const duplicateLinks: { id: string; canonicalId: string }[] = [];

  for (const candidate of candidates) {
    const matchId = findCanonicalMatch(
      candidate,
      canonicalPool,
      WINDOW_MS,
      limits.thresholds.dedup_simhash_distance,
      limits.thresholds.dedup_cosine,
    );
    if (matchId) {
      duplicateLinks.push({ id: candidate.id, canonicalId: matchId });
    } else {
      canonicalPool.push(candidate);
    }
  }

  for (const link of duplicateLinks) {
    // Status is left untouched: relevance scoring (stage 5) filters on
    // canonical_item_id is null, which already excludes duplicates.
    const { error } = await db
      .from("items")
      .update({ canonical_item_id: link.canonicalId })
      .eq("id", link.id);
    if (error) console.error(`dedup: failed to link ${link.id} -> ${link.canonicalId}: ${error.message}`);
  }

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
