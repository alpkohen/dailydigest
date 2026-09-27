import { loadWorkerConfig } from "./config.js";
import { loadEnv, type Env } from "./env.js";
import { runClusterStage } from "./stages/cluster.js";
import { runCreateTopicStage } from "./stages/createTopic.js";
import { runDedupStage } from "./stages/dedup.js";
import { runEmbedStage } from "./stages/embed.js";
import { runExtractStage } from "./stages/extract.js";
import { runIngestStage } from "./stages/ingest.js";
import { runPingStage } from "./stages/ping.js";
import { runRelevanceStage } from "./stages/relevance.js";
import { runSeedSourcesStage } from "./stages/seedSources.js";

type WorkerConfig = Awaited<ReturnType<typeof loadWorkerConfig>>;
type Stage = (env: Env, config: WorkerConfig, date: string, args: Map<string, string>) => Promise<void>;

const STAGES: Record<string, Stage> = {
  ping: (env, config, date) => runPingStage(env, config.models, date),
  seed_sources: (env, config) => runSeedSourcesStage(env, config.sourcesSeed),
  ingest: (env, config, date) => runIngestStage(env, config.limits, date),
  extract: (env, _config, date) => runExtractStage(env, date),
  embed: (env, config, date) => runEmbedStage(env, config.models, date),
  dedup: (env, config, date) => runDedupStage(env, config.limits, date),
  relevance: (env, config, date) => runRelevanceStage(env, config.models, config.limits, date),
  cluster: (env, config, date) => runClusterStage(env, config.models, config.limits, date),
  create_topic: (env, config, _date, args) => {
    const sentence = args.get("topic");
    if (!sentence) throw new Error('create_topic requires --topic="<one sentence>"');
    return runCreateTopicStage(env, config.models, config.limits, sentence);
  },
};

// Order matters for --all: sources before ingest, items before
// extract/embed/dedup/relevance. create_topic is deliberately excluded from
// --all since it needs a --topic argument and is a one-off owner action.
const ALL_STAGE_ORDER = ["seed_sources", "ingest", "extract", "embed", "dedup", "relevance", "cluster"];

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
    await run(env, config, date, args);
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
