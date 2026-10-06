import { loadLimitsConfig, loadModelsConfig, loadSourcesSeedConfig } from "@dailydigest/db";
import { join } from "node:path";

const configDir = join(process.cwd(), "..", "..", "config");

export async function loadWebConfig() {
  return {
    models: await loadModelsConfig(join(configDir, "models.yaml")),
    limits: await loadLimitsConfig(join(configDir, "limits.yaml")),
  };
}

export async function loadSourcesSeed() {
  return loadSourcesSeedConfig(join(configDir, "sources.seed.yaml"));
}
