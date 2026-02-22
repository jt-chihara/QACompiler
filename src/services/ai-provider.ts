import type { GenerateObjectFn } from "./llm-runner.js";
import { createSDKGenerateObjectFn } from "./sdk-ai-provider.js";

/**
 * Create a GenerateObjectFn based on the provider string.
 *
 * Only "claude-code" is supported. It uses the Claude Agent SDK (no API key needed).
 */
export function createGenerateObjectFn(provider: string): GenerateObjectFn {
  if (provider !== "claude-code") {
    throw new Error(`Unsupported provider: "${provider}". Only "claude-code" is supported.`);
  }

  return createSDKGenerateObjectFn();
}
