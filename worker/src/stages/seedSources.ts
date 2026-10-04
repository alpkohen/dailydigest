import { createServiceRoleClient, type SourcesSeedConfig } from "@dailydigest/db";
import type { Env } from "../env.js";

/**
 * Idempotently upserts /config/sources.seed.yaml into the sources and
 * perspective_groups tables (SPEC.md section 4.4: "Seeded from
 * /config/sources.seed.yaml. Owner can add, edit, mute and re-weight in the
 * UI" afterwards — this stage only establishes the initial state).
 */
export async function runSeedSourcesStage(env: Env, sourcesSeed: SourcesSeedConfig): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const groupIdByYamlKey = new Map<string, string>();
  for (const group of sourcesSeed.perspective_groups) {
    const { data, error } = await db
      .from("perspective_groups")
      .upsert(
        { owner_id: env.OWNER_ID, name: group.name },
        { onConflict: "owner_id,name" },
      )
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to upsert perspective group "${group.name}": ${error?.message}`);
    groupIdByYamlKey.set(group.id, data.id);
  }

  // weight/active are owner-editable (learn's drift, Sources page mute
  // toggle) and must never be reset back to the seed defaults on a
  // rerun, so existing sources only get their content fields refreshed.
  const { data: existingRows } = await db.from("sources").select("name").eq("owner_id", env.OWNER_ID);
  const existingNames = new Set((existingRows ?? []).map((r) => r.name));

  const contentFields = (source: SourcesSeedConfig["sources"][number]) => ({
    owner_id: env.OWNER_ID,
    name: source.name,
    type: source.type,
    url_or_query: source.type === "api_openalex" ? source.issn ?? null : source.url ?? null,
    language: source.lang ?? null,
    perspective_group_id: source.group ? (groupIdByYamlKey.get(source.group) ?? null) : null,
    paywalled: source.paywalled ?? false,
    link_pattern: source.link_pattern ?? null,
  });

  const newRows = sourcesSeed.sources
    .filter((s) => !existingNames.has(s.name))
    .map((s) => ({ ...contentFields(s), weight: s.weight, active: true }));
  const updateRows = sourcesSeed.sources.filter((s) => existingNames.has(s.name)).map(contentFields);

  if (newRows.length > 0) {
    const { error } = await db.from("sources").insert(newRows);
    if (error) throw new Error(`Failed to insert new sources: ${error.message}`);
  }
  if (updateRows.length > 0) {
    const { error } = await db.from("sources").upsert(updateRows, { onConflict: "owner_id,name" });
    if (error) throw new Error(`Failed to update existing sources: ${error.message}`);
  }
  const rows = [...newRows, ...updateRows];

  const missingUrl = sourcesSeed.sources.filter(
    (s) => s.type === "rss" && !s.url,
  ).length;
  const missingIssn = sourcesSeed.sources.filter(
    (s) => s.type === "api_openalex" && !s.issn,
  ).length;

  console.log(
    `seedSources: upserted ${sourcesSeed.perspective_groups.length} perspective groups and ${rows.length} sources ` +
      `(${missingUrl} rss sources still missing a verified url, ${missingIssn} openalex sources still missing an issn)`,
  );
}
