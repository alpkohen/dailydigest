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
  const roleConfig = params.modelsConfig.roles[params.role];
  const provider = buildProvider(roleConfig.provider, params.apiKeys);
  const maxTokens = params.maxTokens ?? 1024;

  const startedAt = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await provider.complete({
        model: roleConfig.model,
        system: params.system,
        prompt: params.prompt,
        maxTokens,
      });
      const parsed = params.schema.parse(extractJson(result.text));

      await logLlmCall(params.db, {
        ownerId: params.ownerId,
        runId: params.runId,
        stage: params.stage,
        promptName: params.promptName,
        model: roleConfig.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: computeCostUsd(
          roleConfig.model,
          result.inputTokens,
          result.outputTokens,
          params.modelsConfig.prices_per_million_tokens,
        ),
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
  });

  throw new Error(
    `callLlm failed for prompt "${params.promptName}" after retry: ${lastError?.message}`,
  );
}
