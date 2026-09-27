import type { ModelsConfig } from "@dailydigest/db";

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  prices: ModelsConfig["prices_per_million_tokens"],
): number {
  const price = prices[model];
  if (!price) {
    throw new Error(`No price entry for model "${model}" in models.yaml`);
  }
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
