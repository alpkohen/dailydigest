import { loadLimitsConfig, loadModelsConfig } from "@dailydigest/db";
import { join } from "node:path";

const configDir = join(process.cwd(), "..", "..", "config");

export async function loadWebConfig() {
  return {
    models: await loadModelsConfig(join(configDir, "models.yaml")),
    limits: await loadLimitsConfig(join(configDir, "limits.yaml")),
  };
}
