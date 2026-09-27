import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, Provider } from "./types.js";

export class AnthropicProvider implements Provider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete({ model, system, prompt, maxTokens }: CompletionRequest): Promise<CompletionResult> {
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
