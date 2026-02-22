import { createCLIGenerateObjectFn } from "./cli-ai-provider.js";
import type { GenerateObjectFn } from "./llm-runner.js";
import { createSDKGenerateObjectFn } from "./sdk-ai-provider.js";

/**
 * Create a GenerateObjectFn based on the provider string.
 *
 * - "claude-code": uses Claude Agent SDK (no API key needed)
 * - "codex": spawns local CLI subprocess (no API key needed)
 * - "openai" / "anthropic" / others: uses Vercel AI SDK (requires API key)
 */
export function createGenerateObjectFn(provider: string): GenerateObjectFn {
  if (provider === "claude-code") {
    return createSDKGenerateObjectFn();
  }

  if (provider === "codex") {
    return createCLIGenerateObjectFn();
  }

  // API-based providers via Vercel AI SDK
  return createAPIGenerateObjectFn();
}

function createAPIGenerateObjectFn(): GenerateObjectFn {
  return async (args) => {
    // Dynamic import to avoid loading AI SDK when using CLI providers
    const { generateObject, jsonSchema } = await import("ai");
    const model = await resolveModel(args.provider, args.model);

    const result = await generateObject({
      model,
      prompt: args.prompt,
      schema: jsonSchema(args.schema),
      temperature: args.temperature,
      maxRetries: 0,
    });

    const obj = result.object as unknown as Record<string, unknown>;
    const usage = result.usage?.totalTokens ? { totalTokens: result.usage.totalTokens } : undefined;

    return { object: obj, usage };
  };
}

async function resolveModel(provider: string, modelId: string) {
  if (provider === "openai") {
    const { openai } = await import("@ai-sdk/openai");
    return openai(modelId);
  } else if (provider === "anthropic") {
    const { anthropic } = await import("@ai-sdk/anthropic");
    return anthropic(modelId);
  }
  throw new Error(
    `Unsupported API provider: "${provider}". Use "openai", "anthropic", "claude-code", or "codex".`,
  );
}
