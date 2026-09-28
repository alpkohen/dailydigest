import type { SupabaseClient } from "@supabase/supabase-js";

export interface LogCallParams {
  ownerId: string;
  runId?: string;
  stage?: string;
  promptName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export async function logLlmCall(client: SupabaseClient, params: LogCallParams): Promise<void> {
  const { error } = await client.from("llm_calls").insert({
    owner_id: params.ownerId,
    run_id: params.runId ?? null,
    stage: params.stage ?? null,
    prompt_name: params.promptName,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: params.costUsd,
    latency_ms: params.latencyMs,
    ok: params.ok,
    error: params.error ?? null,
  });

  if (error) {
    throw new Error(`Failed to log llm_calls row: ${error.message}`);
  }
}
