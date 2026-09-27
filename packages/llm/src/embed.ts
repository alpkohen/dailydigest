import type { ModelsConfig } from "@dailydigest/db";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCostUsd } from "./cost.js";
import { logLlmCall } from "./logCall.js";

export interface EmbedTextsParams {
  texts: string[];
  embedding: ModelsConfig["embedding"];
  prices: ModelsConfig["prices_per_million_tokens"];
  apiKeys: { openai?: string };
  db: SupabaseClient;
  ownerId: string;
  runId?: string;
  stage?: string;
}

/**
 * The single entry point for embedding calls (CLAUDE.md rule 2: every LLM
 * call goes through packages/llm and is logged to llm_calls). Batches of up
 * to 2048 inputs are supported by the OpenAI embeddings endpoint; callers
 * should chunk larger batches themselves.
 */
export async function embedTexts(params: EmbedTextsParams): Promise<number[][]> {
  if (params.embedding.provider !== "openai") {
    throw new Error(`Unsupported embedding provider "${params.embedding.provider}"`);
  }
  if (!params.apiKeys.openai) throw new Error("OPENAI_API_KEY is not configured");

  const client = new OpenAI({ apiKey: params.apiKeys.openai });
  const startedAt = Date.now();

  try {
    const response = await client.embeddings.create({
      model: params.embedding.model,
      input: params.texts,
      dimensions: params.embedding.dimensions,
    });

    const inputTokens = response.usage?.total_tokens ?? 0;
    await logLlmCall(params.db, {
      ownerId: params.ownerId,
      runId: params.runId,
      stage: params.stage,
      promptName: "embed",
      model: params.embedding.model,
      inputTokens,
      outputTokens: 0,
      costUsd: computeCostUsd(params.embedding.model, inputTokens, 0, params.prices),
      latencyMs: Date.now() - startedAt,
      ok: true,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  } catch (err) {
    await logLlmCall(params.db, {
      ownerId: params.ownerId,
      runId: params.runId,
      stage: params.stage,
      promptName: "embed",
      model: params.embedding.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startedAt,
      ok: false,
    });
    throw err;
  }
}
