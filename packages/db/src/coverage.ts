/**
 * Layer 3 of source coverage: per-topic warnings, shown in the app and in
 * the daily email. A topic is flagged when too few sources or items matched
 * it recently. Failing sources are listed once, on the Sources page, not
 * repeated under every topic (owner's call, 2026-10-06).
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
  config: CoverageConfig;
}): TopicCoverage[] {
  const { config } = params;

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

    return { topicId: topic.id, topicName: topic.name, items, sources, warnings };
  });
}

/**
 * Loads what computeTopicCoverage needs for every active topic. RLS applies
 * in the app; the worker (service role) passes ownerId instead.
 */
export async function loadTopicCoverage(db: SupabaseClient, config: CoverageConfig, ownerId?: string): Promise<TopicCoverage[]> {
  let topicsQuery = db.from("topics").select("id, name").eq("active", true);
  if (ownerId) topicsQuery = topicsQuery.eq("owner_id", ownerId);
  const [topics, recent] = await Promise.all([topicsQuery, db.rpc("topic_source_coverage", { p_days: config.window_days })]);
  for (const r of [topics, recent]) {
    if (r.error) throw new Error(`Failed to load topic coverage: ${r.error.message}`);
  }
  return computeTopicCoverage({
    topics: (topics.data ?? []) as { id: string; name: string }[],
    recent: (recent.data ?? []) as CoverageRow[],
    config,
  });
}
