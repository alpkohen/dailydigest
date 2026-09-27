import type { ModelsConfig } from "@dailydigest/db";
import { loadWorkerConfig } from "./config.js";
import { loadEnv, type Env } from "./env.js";
import { runPingStage } from "./stages/ping.js";

type Stage = (env: Env, models: ModelsConfig, date: string) => Promise<void>;

const STAGES: Record<string, Stage> = {
  ping: runPingStage,
};

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
  const { models } = await loadWorkerConfig();

  const stagesToRun = runAll ? Object.keys(STAGES) : [stage as string];
  for (const name of stagesToRun) {
    const run = STAGES[name];
    if (!run) {
      console.error(`Unknown stage "${name}". Known stages: ${Object.keys(STAGES).join(", ")}`);
      process.exit(1);
    }
    console.log(`--- running stage "${name}" for ${date} ---`);
    await run(env, models, date);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
