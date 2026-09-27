import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const modelRoleSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  model: z.string(),
});

export const modelsConfigSchema = z.object({
  roles: z.object({
    fast: modelRoleSchema,
    mid: modelRoleSchema,
    strong: modelRoleSchema,
  }),
  embedding: z.object({
    provider: z.string(),
    model: z.string(),
    dimensions: z.number().int().positive(),
  }),
  prices_per_million_tokens: z.record(
    z.string(),
    z.object({ input: z.number(), output: z.number() }),
  ),
  fallbacks: z.record(z.string(), modelRoleSchema).optional(),
});
export type ModelsConfig = z.infer<typeof modelsConfigSchema>;

export const limitsConfigSchema = z.object({
  daily_budget_usd: z.number().positive(),
  budget_warning_threshold_pct: z.number().min(0).max(100).default(80),
  max_items_per_source_per_run: z.number().int().positive(),
  thresholds: z.object({
    relevance_default: z.number().min(0).max(10),
    relevance_prefilter_cosine: z.number().min(-1).max(1),
    cluster_high: z.number().min(0).max(1),
    cluster_low: z.number().min(0).max(1),
    dedup_simhash_distance: z.number().int().min(0),
    dedup_cosine: z.number().min(0).max(1),
  }),
  alerts: z.object({
    max_per_day: z.number().int().nonnegative(),
    quiet_hours_start: z.string(),
    quiet_hours_end: z.string(),
  }),
});
export type LimitsConfig = z.infer<typeof limitsConfigSchema>;

export const perspectiveGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const sourceSeedSchema = z.object({
  name: z.string(),
  type: z.enum(["rss", "api_openalex", "api_gdelt", "api_exa", "sitemap", "scrape"]),
  lang: z.string().optional(),
  group: z.string().nullable().optional(),
  weight: z.number().min(0).max(1),
  paywalled: z.boolean().optional(),
  url: z.string().nullable().optional(),
  issn: z.string().optional(),
});

export const sourcesSeedConfigSchema = z.object({
  perspective_groups: z.array(perspectiveGroupSchema),
  sources: z.array(sourceSeedSchema),
});
export type SourcesSeedConfig = z.infer<typeof sourcesSeedConfigSchema>;

async function loadYaml(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf-8");
  return parseYaml(raw);
}

export async function loadModelsConfig(path: string): Promise<ModelsConfig> {
  return modelsConfigSchema.parse(await loadYaml(path));
}

export async function loadLimitsConfig(path: string): Promise<LimitsConfig> {
  return limitsConfigSchema.parse(await loadYaml(path));
}

export async function loadSourcesSeedConfig(path: string): Promise<SourcesSeedConfig> {
  return sourcesSeedConfigSchema.parse(await loadYaml(path));
}
