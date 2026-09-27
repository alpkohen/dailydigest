import { loadWorkerConfig } from "./config.js";
import { loadEnv, type Env } from "./env.js";
import { runExtractStage } from "./stages/extract.js";
import { runIngestStage } from "./stages/ingest.js";
import { runPingStage } from "./stages/ping.js";
import { runSeedSourcesStage } from "./stages/seedSources.js";

type WorkerConfig = Awaited<ReturnType<typeof loadWorkerConfig>>;
type Stage = (env: Env, config: WorkerConfig, date: string) => Promise<void>;

const STAGES: Record<string, Stage> = {
  ping: (env, config, date) => runPingStage(env, config.models, date),
  seed_sources: (env, config) => runSeedSourcesStage(env, config.sourcesSeed),
  ingest: (env, config, date) => runIngestStage(env, config.limits, date),
  extract: (env, _config, date) => runExtractStage(env, date),
};

// Order matters for --all: sources must exist before ingest can read them,
// and items must exist before extract can process them.
const ALL_STAGE_ORDER = ["seed_sources", "ingest", "extract"];

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1]!, match[2]!);
    else if (arg.startsWith("--")) args.set(arg.slice(2), "true");
  }
  return args;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.get("date") ?? today();
  const runAll = args.get("all") === "true";
  const stage = args.get("stage");

  if (!runAll && !stage) {
    console.error("Usage: worker --stage=<name> --date=<YYYY-MM-DD> | --all");
    process.exit(1);
  }

  const env = loadEnv();
  const config = await loadWorkerConfig();

  const stagesToRun = runAll ? ALL_STAGE_ORDER : [stage as string];
  for (const name of stagesToRun) {
    const run = STAGES[name];
    if (!run) {
      console.error(`Unknown stage "${name}". Known stages: ${Object.keys(STAGES).join(", ")}`);
      process.exit(1);
    }
    console.log(`--- running stage "${name}" for ${date} ---`);
    await run(env, config, date);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // rss-parser's underlying HTTP agent can keep the event loop alive
    // indefinitely, so every exit path here is explicit.
    console.error(err);
    process.exit(1);
  });
