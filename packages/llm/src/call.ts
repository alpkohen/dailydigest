import type { ModelsConfig } from "@dailydigest/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodSchema } from "zod";
import { AnthropicProvider } from "./anthropic.js";
import { computeCostUsd } from "./cost.js";
import { logLlmCall } from "./logCall.js";
import { OpenAIProvider } from "./openai.js";
import type { Provider, Role } from "./types.js";

export interface CallLlmParams<T> {
  role: Role;
  promptName: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  schema: ZodSchema<T>;
  modelsConfig: ModelsConfig;
  apiKeys: { anthropic?: string; openai?: string };
  db: SupabaseClient;
  ownerId: string;
  runId?: string;
  stage?: string;
}

// Per-process spend cap. A worker process is one stage run, so this bounds
// what a single run can spend: set LLM_RUN_BUDGET_USD and every callLlm
// after the running total reaches it throws instead of calling the model.
// Callers already treat a thrown call as a failure and leave the work
// pending (relevance leaves items "embedded", enrich leaves summary null),
// so the run winds down cleanly and the next run picks up the rest. In-flight
// concurrent calls can overshoot by a few calls, not by a stage.
let runSpentUsd = 0;

export class RunBudgetExceededError extends Error {
  constructor(spent: number, budget: number) {
    super(`run LLM budget exceeded: USD ${spent.toFixed(2)} spent of ${budget.toFixed(2)} (LLM_RUN_BUDGET_USD)`);
    this.name = "RunBudgetExceededError";
  }
}

// Set by the worker from the remaining daily budget (limits.yaml
// daily_budget_usd minus today's llm_calls spend). Unlike the env var, 0 is
// meaningful here: it blocks every call.
let budgetOverrideUsd: number | null = null;

export function setRunBudgetUsd(value: number): void {
  budgetOverrideUsd = Math.max(0, value);
}

function runBudgetUsd(): number | null {
  if (budgetOverrideUsd != null) return budgetOverrideUsd;
  const raw = process.env.LLM_RUN_BUDGET_USD;
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getRunSpentUsd(): number {
  return runSpentUsd;
}

function buildProvider(
  name: "anthropic" | "openai",
  apiKeys: CallLlmParams<unknown>["apiKeys"],
): Provider {
  if (name === "anthropic") {
    if (!apiKeys.anthropic) throw new Error("ANTHROPIC_API_KEY is not configured");
    return new AnthropicProvider(apiKeys.anthropic);
  }
  if (!apiKeys.openai) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAIProvider(apiKeys.openai);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  return JSON.parse(candidate);
}

/**
 * The single entry point every prompt call must go through (CLAUDE.md rule 2):
 * resolves the model for the given role from models.yaml, validates the JSON
 * response with the caller's Zod schema (one retry on validation failure per
 * SPEC.md section 7), and always logs to llm_calls with tokens and cost.
 */
export async function callLlm<T>(params: CallLlmParams<T>): Promise<T> {
  const budget = runBudgetUsd();
  if (budget != null && runSpentUsd >= budget) throw new RunBudgetExceededError(runSpentUsd, budget);

  const roleConfig = params.modelsConfig.roles[params.role];
  const provider = buildProvider(roleConfig.provider, params.apiKeys);
  const maxTokens = params.maxTokens ?? 1024;

  const startedAt = Date.now();
  let lastError: Error | undefined;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      // Jittered exponential backoff: a bare immediate retry tends to land
      // on the exact same rate limit it just tripped, especially when many
      // items are being scored concurrently (e.g. relevance's worker pool).
      const backoffMs = 300 * 2 ** (attempt - 1) + Math.random() * 300;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
    try {
      const result = await provider.complete({
        model: roleConfig.model,
        system: params.system,
        prompt: params.prompt,
        maxTokens,
      });
      const parsed = params.schema.parse(extractJson(result.text));

      const costUsd = computeCostUsd(
        roleConfig.model,
        result.inputTokens,
        result.outputTokens,
        params.modelsConfig.prices_per_million_tokens,
      );
      runSpentUsd += costUsd;

      await logLlmCall(params.db, {
        ownerId: params.ownerId,
        runId: params.runId,
        stage: params.stage,
        promptName: params.promptName,
        model: roleConfig.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        latencyMs: Date.now() - startedAt,
        ok: true,
      });

      return parsed;
    } catch (err) {
      lastError = err as Error;
    }
  }

  await logLlmCall(params.db, {
    ownerId: params.ownerId,
    runId: params.runId,
    stage: params.stage,
    promptName: params.promptName,
    model: roleConfig.model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: Date.now() - startedAt,
    ok: false,
    error: lastError?.message?.slice(0, 500),
  });

  throw new Error(
    `callLlm failed for prompt "${params.promptName}" after ${maxAttempts} attempts: ${lastError?.message}`,
  );
}
