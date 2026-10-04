import { createServiceRoleClient } from "@dailydigest/db";
import { setRunBudgetUsd } from "@dailydigest/llm";
import { loadWorkerConfig } from "./config.js";
import { loadEnv, type Env } from "./env.js";
import { runClusterStage } from "./stages/cluster.js";
import { runComposeBriefStage } from "./stages/composeBrief.js";
import { runCreateQuestionStage } from "./stages/createQuestion.js";
import { runCreateTopicStage } from "./stages/createTopic.js";
import { runDedupStage } from "./stages/dedup.js";
import { runDeliverStage } from "./stages/deliver.js";
import { runEmbedStage } from "./stages/embed.js";
import { runEnrichStage } from "./stages/enrich.js";
import { runExtractStage } from "./stages/extract.js";
import { runGroupStage } from "./stages/group.js";
import { runIngestStage } from "./stages/ingest.js";
import { runLearnStage } from "./stages/learn.js";
import { runMatchStage } from "./stages/match.js";
import { runRetentionStage } from "./stages/retention.js";
import { runPingStage } from "./stages/ping.js";
import { runQuestionEvidenceStage } from "./stages/questionEvidence.js";
import { runQuestionUpdateStage } from "./stages/questionUpdate.js";
import { runRelevanceStage } from "./stages/relevance.js";
import { runResearchSummaryStage } from "./stages/researchSummary.js";
import { runScoreStage } from "./stages/score.js";
import { runSeedSourcesStage } from "./stages/seedSources.js";
import { runWatchIngestStage } from "./stages/watchIngest.js";

type WorkerConfig = Awaited<ReturnType<typeof loadWorkerConfig>>;
type Stage = (env: Env, config: WorkerConfig, date: string, args: Map<string, string>) => Promise<void>;

const STAGES: Record<string, Stage> = {
  ping: (env, config, date) => runPingStage(env, config.models, date),
  seed_sources: (env, config) => runSeedSourcesStage(env, config.sourcesSeed),
  ingest: (env, config, date) => runIngestStage(env, config.limits, date),
  watch_ingest: (env, config, date) => runWatchIngestStage(env, config.limits, date),
  match: (env, config, date) => runMatchStage(env, config.models, config.limits, date),
  group: (env, config, date) => runGroupStage(env, config.models, config.limits, date),
  retention: (env, config) => runRetentionStage(env, config.limits),
  // Previous pipeline's stages: no longer scheduled, kept runnable by name.
  extract: (env, _config, date) => runExtractStage(env, date),
  embed: (env, config, date) => runEmbedStage(env, config.models, date),
  dedup: (env, config, date) => runDedupStage(env, config.limits, date),
  relevance: (env, config, date) => runRelevanceStage(env, config.models, config.limits, date),
  cluster: (env, config, date) => runClusterStage(env, config.models, config.limits, date),
  score: (env, config, date) => runScoreStage(env, config.models, date),
  enrich: (env, config, date) => runEnrichStage(env, config.models, date),
  research_summary: (env, config, date) => runResearchSummaryStage(env, config.models, date),
  question_evidence: (env, config, date) => runQuestionEvidenceStage(env, config.models, date),
  compose_brief: (env, config, date) => runComposeBriefStage(env, config.models, config.limits, date),
  deliver: (env, _config, date) => runDeliverStage(env, date),
  learn: (env, _config, date) => runLearnStage(env, date),
  // Weekly, not part of --all (SPEC.md section 4.2; run by its own workflow).
  question_update: (env, config, date) => runQuestionUpdateStage(env, config.models, date),
  create_topic: (env, config, _date, args) => {
    const sentence = args.get("topic");
    if (!sentence) throw new Error('create_topic requires --topic="<one sentence>"');
    return runCreateTopicStage(env, config.models, config.limits, sentence);
  },
  create_question: (env, config, _date, args) => {
    const text = args.get("question");
    if (!text) throw new Error('create_question requires --question="<text>"');
    return runCreateQuestionStage(env, config.models, text);
  },
};

// Collect: fetch sources, match new items to topics, group matched items
// into events. Runs every few hours so the app stays current; each stage
// works by row status, so a run only handles what's new since the last one.
const COLLECT_STAGE_ORDER = ["ingest", "watch_ingest", "match", "group"];

// Daily (--all): collect, then the brief and email, then cleanup.
// create_topic, create_question and question_update are one-off/weekly
// actions, deliberately excluded.
const ALL_STAGE_ORDER = [
  "seed_sources",
  "learn",
  ...COLLECT_STAGE_ORDER,
  "research_summary",
  "compose_brief",
  "deliver",
  "retention",
];

/**
 * Daily LLM spend cap (limits.yaml daily_budget_usd), on top of any per-run
 * LLM_RUN_BUDGET_USD: today's spend is read from llm_calls, and callLlm
 * refuses further calls once the remainder is used up.
 */
async function applyDailyBudget(env: Env, dailyBudgetUsd: number): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const startOfDay = `${today()}T00:00:00Z`;
  const { data, error } = await db
    .from("llm_calls")
    .select("cost_usd")
    .eq("owner_id", env.OWNER_ID)
    .gte("created_at", startOfDay)
    // PostgREST caps a select at 1000 rows; the pipeline makes well under
    // 100 calls a day, so a cap-sized page is the whole day.
    .limit(1000);
  if (error) throw new Error(`Failed to read today's LLM spend: ${error.message}`);
  const spent = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const runCap = Number(process.env.LLM_RUN_BUDGET_USD);
  const remaining = Math.max(0, dailyBudgetUsd - spent);
  setRunBudgetUsd(Number.isFinite(runCap) && runCap > 0 ? Math.min(runCap, remaining) : remaining);
  console.log(`LLM budget: USD ${spent.toFixed(2)} spent today of ${dailyBudgetUsd.toFixed(2)}, ${remaining.toFixed(2)} left`);
}

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

// A stage that crashes or gets killed (CI timeout, manual kill) leaves its
// pipeline_runs row in "running" forever, since only the normal completion
// path ever sets finished_at/status. A full-system audit found runs stuck
// like this with no way to tell whether they were still in progress or long
// dead. Anything still "running" from before this process started is
// necessarily dead, since only one worker invocation runs at a time here.
const STUCK_RUN_HOURS = 6;

async function reclaimStuckRuns(env: Env): Promise<void> {
  const db = createServiceRoleClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const cutoff = new Date(Date.now() - STUCK_RUN_HOURS * 60 * 60 * 1000).toISOString();
  await db
    .from("pipeline_runs")
    .update({ finished_at: new Date().toISOString(), status: "failed" })
    .eq("owner_id", env.OWNER_ID)
    .eq("status", "running")
    .lt("started_at", cutoff);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.get("date") ?? today();
  const runAll = args.get("all") === "true";
  const runCollect = args.get("collect") === "true";
  const stage = args.get("stage");

  if (!runAll && !runCollect && !stage) {
    console.error("Usage: worker --stage=<name> --date=<YYYY-MM-DD> | --all | --collect");
    process.exit(1);
  }

  const env = loadEnv();

  if (env.WORKER_BACKGROUND_PAUSED === "true") {
    console.log("WORKER_BACKGROUND_PAUSED=true - skipping this run entirely (no stages, no LLM calls, no fetches).");
    return;
  }

  const config = await loadWorkerConfig();
  await reclaimStuckRuns(env);
  await applyDailyBudget(env, config.limits.daily_budget_usd);

  const stagesToRun = runAll ? ALL_STAGE_ORDER : runCollect ? COLLECT_STAGE_ORDER : [stage as string];
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
