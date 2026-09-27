import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLimitsConfig, loadModelsConfig, loadSourcesSeedConfig } from "../config.js";

const configDir = join(__dirname, "..", "..", "..", "..", "config");

describe("config loading", () => {
  it("parses models.yaml against the schema", async () => {
    const config = await loadModelsConfig(join(configDir, "models.yaml"));
    expect(config.roles.fast.provider).toBe("openai");
    expect(config.embedding.dimensions).toBeGreaterThan(0);
  });

  it("parses limits.yaml against the schema", async () => {
    const config = await loadLimitsConfig(join(configDir, "limits.yaml"));
    expect(config.daily_budget_usd).toBeGreaterThan(0);
    expect(config.thresholds.cluster_high).toBeGreaterThan(config.thresholds.cluster_low);
  });

  it("parses sources.seed.yaml against the schema", async () => {
    const config = await loadSourcesSeedConfig(join(configDir, "sources.seed.yaml"));
    expect(config.perspective_groups.length).toBeGreaterThan(0);
    expect(config.sources.length).toBeGreaterThan(0);
  });
});
