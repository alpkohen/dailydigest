import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLimitsConfig, loadModelsConfig, loadSourcesSeedConfig } from "@dailydigest/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = join(__dirname, "..", "..", "config");

export async function loadWorkerConfig() {
  return {
    models: await loadModelsConfig(join(configDir, "models.yaml")),
    limits: await loadLimitsConfig(join(configDir, "limits.yaml")),
    sourcesSeed: await loadSourcesSeedConfig(join(configDir, "sources.seed.yaml")),
  };
}
