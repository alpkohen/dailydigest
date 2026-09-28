import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModelsConfig } from "@dailydigest/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = join(__dirname, "..", "..", "config");

export async function loadEvalModelsConfig() {
  return loadModelsConfig(join(configDir, "models.yaml"));
}
