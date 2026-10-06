import { createServiceRoleClient, type LimitsConfig, type ModelsConfig } from "@dailydigest/db";
import { buildSourceSuggestPrompt, callLlm, sourceSuggestSchema } from "@dailydigest/llm";
import { discoverSource, hostKey } from "../connectors/discover.js";
import type { Env } from "../env.js";

const DISCOVERY_TIMEOUT_MS = 90_000;
const DISCOVERY_CONCURRENCY = 4;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);
}

/**
 * Layer 2 of source coverage: for each topic not yet handled, asks a model
 * for publications that cover it, finds and checks each one's feed or
 * sitemap, and stores the results for the owner to add or dismiss in the
 * app. Runs once per topic (topics.sources_suggested_at), so a topic
 * created in the app gets suggestions on the next collect run. Nothing is
 * added to the sources table here: the owner decides.
 */
export async function runSuggestSourcesStage(env: Env, models: ModelsConfig, limits: LimitsConfig): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const cfg = limits.pipeline.source_suggestions;

  const { data: topics, error } = await db
    .from("topics")
    .select("id, name, description")
    .eq("owner_id", env.OWNER_ID)
    .eq("active", true)
    .is("sources_suggested_at", null)
    .order("created_at", { ascending: false })
    .limit(cfg.topics_per_run);
  if (error) throw new Error(`Failed to load topics: ${error.message}`);
  if (!topics || topics.length === 0) {
    console.log("suggest_sources: no topic waiting for suggestions");
    return;
  }

  const { data: sources, error: sourcesError } = await db.from("sources").select("name, url_or_query").eq("owner_id", env.OWNER_ID);
  if (sourcesError) throw new Error(`Failed to load sources: ${sourcesError.message}`);
  const followedNames = (sources ?? []).map((s) => s.name as string);
  const followedHosts = new Set((sources ?? []).map((s) => (s.url_or_query ? hostKey(s.url_or_query as string) : null)).filter(Boolean));
  const followedLower = new Set(followedNames.map((n) => n.toLowerCase()));

  for (const topic of topics) {
    let suggestions;
    try {
      const result = await callLlm({
        role: "mid",
        promptName: "source_suggest",
        prompt: buildSourceSuggestPrompt({ topic, existingSources: followedNames, max: cfg.max_per_topic }),
        schema: sourceSuggestSchema,
        modelsConfig: models,
        apiKeys: { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY },
        db,
        ownerId: env.OWNER_ID,
        stage: "suggest_sources",
        maxTokens: 2000,
      });
      suggestions = result.sources;
    } catch (err) {
      // Left unmarked, so the next run retries this topic.
      console.error(`suggest_sources: suggestion call for "${topic.name}" failed: ${(err as Error).message}`);
      continue;
    }

    const fresh = suggestions
      .filter((s) => !followedLower.has(s.name.toLowerCase()))
      .filter((s) => {
        const host = hostKey(s.homepage);
        return host !== null && !followedHosts.has(host);
      })
      .slice(0, cfg.max_per_topic);

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < fresh.length; i += DISCOVERY_CONCURRENCY) {
      const batch = fresh.slice(i, i + DISCOVERY_CONCURRENCY);
      const checked = await Promise.all(
        batch.map(async (s) => {
          const found = await withTimeout(discoverSource(s.homepage, cfg.fresh_days), DISCOVERY_TIMEOUT_MS).catch((err: Error) => ({
            status: "no_feed" as const,
            sourceType: null,
            feedUrl: null,
            recentItems: null,
            note: err.message,
          }));
          return {
            owner_id: env.OWNER_ID,
            topic_id: topic.id,
            name: s.name,
            homepage: s.homepage,
            reason: s.reason,
            language: s.language.slice(0, 5),
            source_type: found.sourceType,
            feed_url: found.feedUrl,
            recent_items: found.recentItems,
            status: found.status,
            check_note: found.note,
          };
        }),
      );
      rows.push(...checked);
    }

    if (rows.length > 0) {
      // A name already suggested for this topic keeps its row (and the
      // owner's add/dismiss decision).
      const { error: insertError } = await db
        .from("topic_source_suggestions")
        .upsert(rows, { onConflict: "topic_id,name", ignoreDuplicates: true });
      if (insertError) throw new Error(`Failed to store suggestions: ${insertError.message}`);
    }
    await db.from("topics").update({ sources_suggested_at: new Date().toISOString() }).eq("id", topic.id);

    const usable = rows.filter((r) => r.status === "ok").length;
    console.log(`suggest_sources: "${topic.name}": ${rows.length} checked, ${usable} with a working feed`);
  }
}
