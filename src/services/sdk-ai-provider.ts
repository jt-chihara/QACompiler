import type { GenerateObjectFn, GenerateObjectResult } from "./llm-runner.js";

export type SDKQueryFn = (params: {
  prompt: string;
  options?: {
    tools?: string[];
    maxTurns?: number;
    model?: string;
    persistSession?: boolean;
    thinking?:
      | { type: "disabled" }
      | { type: "enabled"; budgetTokens?: number }
      | { type: "adaptive" };
  };
}) => AsyncGenerator<SDKResultLike, void>;

export interface SDKResultLike {
  type: string;
  subtype?: string;
  result?: string;
}

export interface SDKProviderOptions {
  queryFn?: SDKQueryFn;
}

function buildPromptWithSchema(prompt: string, schema: Record<string, unknown>): string {
  const schemaStr = JSON.stringify(schema, null, 2);
  return `${prompt}

You MUST respond with ONLY valid JSON that conforms to this JSON Schema:
${schemaStr}

Output ONLY the JSON object, no other text, no markdown code blocks.`;
}

/**
 * Extract a JSON object from a string that may contain surrounding text or markdown code blocks.
 */
function extractJSON(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    // continue to other strategies
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // continue
    }
  }

  throw new Error(`Could not extract valid JSON from output:\n${trimmed.slice(0, 200)}`);
}

async function defaultQueryFn(params: {
  prompt: string;
  options?: Record<string, unknown>;
}): Promise<{ result: string }> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  let resultText = "";
  let hasResult = false;

  for await (const message of query({
    prompt: params.prompt,
    options: params.options as Parameters<typeof query>[0]["options"],
  })) {
    if (message.type === "result") {
      const msg = message as { subtype?: string; result?: string; errors?: string[] };
      if (msg.subtype === "success" && msg.result) {
        resultText = msg.result;
        hasResult = true;
      } else if (msg.subtype?.startsWith("error")) {
        const errors = msg.errors ?? [];
        throw new Error(`Claude Agent SDK error: ${msg.subtype} ${errors.join(", ")}`);
      }
    }
  }

  if (!hasResult) {
    throw new Error("Claude Agent SDK returned no result");
  }

  return { result: resultText };
}

/**
 * Create a GenerateObjectFn that uses the Claude Agent SDK.
 * This runs Claude Code in-process via the SDK, avoiding subprocess overhead.
 */
export function createSDKGenerateObjectFn(options?: SDKProviderOptions): GenerateObjectFn {
  const queryFn = options?.queryFn;

  return async (args): Promise<GenerateObjectResult> => {
    const fullPrompt = buildPromptWithSchema(args.prompt, args.schema);

    const sdkOptions = {
      tools: [] as string[],
      maxTurns: 1,
      model: args.model && args.model !== "default" ? args.model : undefined,
      persistSession: false,
      thinking: { type: "disabled" as const },
    };

    let resultText: string;

    if (queryFn) {
      // Test mode: use injected query function
      let hasResult = false;
      for await (const message of queryFn({ prompt: fullPrompt, options: sdkOptions })) {
        if (message.type === "result" && message.subtype === "success" && message.result) {
          resultText = message.result;
          hasResult = true;
        }
      }
      if (!hasResult) {
        throw new Error("Claude Agent SDK returned no result");
      }
    } else {
      // Production: use real SDK
      const response = await defaultQueryFn({ prompt: fullPrompt, options: sdkOptions });
      resultText = response.result;
    }

    const object = extractJSON(resultText!);
    return { object };
  };
}
