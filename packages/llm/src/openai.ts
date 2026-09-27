import OpenAI from "openai";
import type { CompletionRequest, CompletionResult, Provider } from "./types.js";

export class OpenAIProvider implements Provider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete({ model, system, prompt, maxTokens }: CompletionRequest): Promise<CompletionResult> {
    const response = await this.client.chat.completions.create({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: prompt },
      ],
    });

    return {
      text: response.choices[0]?.message?.content ?? "",
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }
}
