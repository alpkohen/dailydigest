import { createServiceRoleClient, type LimitsConfig } from "@dailydigest/db";
import { fetchExaResults } from "../connectors/exa.js";
import { fetchGdeltArticles } from "../connectors/gdelt.js";
import { canonicalizeUrl } from "../lib/canonicalUrl.js";
import type { Env } from "../env.js";

interface WatchRow {
  id: string;
  name: string;
  identifiers: { query?: string } | null;
}

/**
 * SPEC.md section 4.3: "New output appears in a 'From your watchlist'
 * section regardless of topic scoring." MVP: watches carry a search query
 * (identifiers.query) and reuse the GDELT/Exa connectors already built for
 * topics; feed-URL/OpenAlex-author-id-specific watch sources are a later
 * refinement, not required for this milestone.
 */
export async function runWatchIngestStage(env: Env, limits: LimitsConfig, date: string): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: run, error: runError } = await db
    .from("pipeline_runs")
    .insert({ owner_id: env.OWNER_ID, kind: "manual", stats: { stage: "watch_ingest", date } })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Failed to create pipeline_runs row: ${runError?.message}`);

  const { data: watches, error: watchesError } = await db
    .from("watches")
    .select("id, name, identifiers")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true);
  if (watchesError) throw new Error(`Failed to load watches: ${watchesError.message}`);

  let linked = 0;

  for (const watch of (watches ?? []) as WatchRow[]) {
    const query = watch.identifiers?.query ?? watch.name;

    const results = [
      ...(await fetchGdeltArticles(query).catch((err) => {
        console.error(`watch_ingest: gdelt failed for "${watch.name}": ${(err as Error).message}`);
        return [];
      })),
      ...(env.EXA_API_KEY
        ? await fetchExaResults(env.EXA_API_KEY, query).catch((err) => {
            console.error(`watch_ingest: exa failed for "${watch.name}": ${(err as Error).message}`);
            return [];
          })
        : []),
    ].slice(0, limits.max_items_per_source_per_run);

    for (const result of results) {
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(result.url);
      } catch {
        continue;
      }

      // ignoreDuplicates: true, matching ingest.ts's insertItems — an
      // already-processed item must not be silently reset to "new" just
      // because a watch's search re-surfaces the same URL.
      await db
        .from("items")
        .upsert(
          {
            owner_id: env.OWNER_ID,
            canonical_url: canonicalUrl,
            url: result.url,
            title: result.title,
            status: "new",
          },
          { onConflict: "owner_id,canonical_url", ignoreDuplicates: true },
        );

      const { data: item } = await db
        .from("items")
        .select("id")
        .eq("owner_id", env.OWNER_ID)
        .eq("canonical_url", canonicalUrl)
        .single();
      if (!item) continue;

      const { error } = await db
        .from("watch_items")
        .upsert({ owner_id: env.OWNER_ID, watch_id: watch.id, item_id: item.id }, { onConflict: "watch_id,item_id" });
      if (!error) linked++;
    }
  }

  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "ok", stats: { stage: "watch_ingest", date, linked } })
    .eq("id", run.id);

  console.log(`watch_ingest stage done: ${linked} items linked to watches`);
}
