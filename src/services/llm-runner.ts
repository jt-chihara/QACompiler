import { readFileSync } from "node:fs";
import type { LLMConfig, RetryConfig } from "../models/workflow.js";

export interface GenerateObjectResult {
  object: Record<string, unknown>;
  reasoning?: string;
  usage?: { totalTokens: number };
}

export type GenerateObjectFn = (args: {
  prompt: string;
  schema: Record<string, unknown>;
  model: string;
  provider: string;
  temperature?: number;
  maxTokens?: number;
}) => Promise<GenerateObjectResult>;

export interface LLMRunnerOptions {
  generateObjectFn: GenerateObjectFn;
}

export interface RunStepInput {
  resolvedPrompt: string;
  outputSchemaPath: string;
  llmConfig: LLMConfig;
  retry?: RetryConfig;
}

export interface RunStepResult {
  output: Record<string, unknown>;
  reasoning: string;
}

export class LLMRunner {
  private readonly generateObjectFn: GenerateObjectFn;

  constructor(options: LLMRunnerOptions) {
    this.generateObjectFn = options.generateObjectFn;
  }

  async runStep(input: RunStepInput): Promise<RunStepResult> {
    const schema = JSON.parse(readFileSync(input.outputSchemaPath, "utf-8"));
    const maxAttempts = input.retry?.max_attempts ?? 1;
    const backoffMs = input.retry?.backoff_ms ?? 1000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.generateObjectFn({
          prompt: input.resolvedPrompt,
          schema,
          model: input.llmConfig.model,
          provider: input.llmConfig.provider,
          temperature: input.llmConfig.temperature,
          maxTokens: input.llmConfig.max_tokens,
        });

        return {
          output: result.object,
          reasoning: result.reasoning ?? "",
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts && backoffMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError;
  }
}
