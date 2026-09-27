export type Role = "fast" | "mid" | "strong";
export type ProviderName = "anthropic" | "openai";

export interface CompletionRequest {
  model: string;
  system?: string;
  prompt: string;
  maxTokens: number;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Provider {
  readonly name: ProviderName;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
