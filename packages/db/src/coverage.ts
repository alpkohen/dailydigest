/**
 * Layer 3 of source coverage: per-topic warnings, shown in the app and in
 * the daily email. A topic is flagged when too few sources or items matched
 * it recently, or when a source that used to feed it has stopped working.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CoverageConfig {
  window_days: number;
  min_sources: number;
  min_items: number;
  contributor_window_days: number;
}

export interface CoverageRow {
  topic_id: string;
  source_id: string | null;
  items: number;
}

export interface CoverageSource {
  id: string;
  name: string;
  health_status: string;
  active: boolean;
}

export interface TopicCoverage {
  topicId: string;
  topicName: string;
  items: number;
  sources: number;
  warnings: string[];
}

export function computeTopicCoverage(params: {
  topics: { id: string; name: string }[];
  recent: CoverageRow[];
  contributors: CoverageRow[];
  sources: CoverageSource[];
  config: CoverageConfig;
}): TopicCoverage[] {
  const { config } = params;
  const sourceById = new Map(params.sources.map((s) => [s.id, s]));

  return params.topics.map((topic) => {
    const recent = params.recent.filter((r) => r.topic_id === topic.id && r.source_id);
    const items = recent.reduce((sum, r) => sum + Number(r.items), 0);
    const sources = new Set(recent.map((r) => r.source_id)).size;
    const warnings: string[] = [];

    if (sources < config.min_sources || items < config.min_items) {
      warnings.push(
        `Few articles: ${items} from ${sources} ${sources === 1 ? "source" : "sources"} in the last ${config.window_days} days.`,
      );
    }

    const failing = [
      ...new Set(
        params.contributors
          .filter((r) => r.topic_id === topic.id && r.source_id)
          .map((r) => sourceById.get(r.source_id!))
          .filter((s): s is CoverageSource => Boolean(s && s.active && (s.health_status === "broken" || s.health_status === "degraded")))
          .map((s) => s.name),
      ),
    ].sort();
    if (failing.length > 0) warnings.push(`Not receiving articles from: ${failing.join(", ")}.`);

    return { topicId: topic.id, topicName: topic.name, items, sources, warnings };
  });
}

/**
 * Loads what computeTopicCoverage needs for every active topic. RLS applies
 * in the app; the worker (service role) passes ownerId instead.
 */
export async function loadTopicCoverage(db: SupabaseClient, config: CoverageConfig, ownerId?: string): Promise<TopicCoverage[]> {
  let topicsQuery = db.from("topics").select("id, name").eq("active", true);
  let sourcesQuery = db.from("sources").select("id, name, health_status, active");
  if (ownerId) {
    topicsQuery = topicsQuery.eq("owner_id", ownerId);
    sourcesQuery = sourcesQuery.eq("owner_id", ownerId);
  }
  const [topics, recent, contributors, sources] = await Promise.all([
    topicsQuery,
    db.rpc("topic_source_coverage", { p_days: config.window_days }),
    db.rpc("topic_source_coverage", { p_days: config.contributor_window_days }),
    sourcesQuery,
  ]);
  for (const r of [topics, recent, contributors, sources]) {
    if (r.error) throw new Error(`Failed to load topic coverage: ${r.error.message}`);
  }
  return computeTopicCoverage({
    topics: (topics.data ?? []) as { id: string; name: string }[],
    recent: (recent.data ?? []) as CoverageRow[],
    contributors: (contributors.data ?? []) as CoverageRow[],
    sources: (sources.data ?? []) as CoverageSource[],
    config,
  });
}
