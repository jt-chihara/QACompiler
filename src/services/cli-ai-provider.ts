import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GenerateObjectFn, GenerateObjectResult } from "./llm-runner.js";

const execFileAsync = promisify(execFile);

export type ExecFn = (
  cmd: string,
  args: string[],
  options?: { stdin?: string },
) => Promise<{ stdout: string; stderr?: string }>;

export interface CLIProviderOptions {
  execFn?: ExecFn;
  timeout?: number;
}

/**
 * Extract a JSON object from a string that may contain surrounding text or markdown code blocks.
 */
export function extractJSON(text: string): Record<string, unknown> {
  const trimmed = text.trim();

  // Try direct parse
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    // continue to other strategies
  }

  // Try extracting from markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Try finding a JSON object in the text
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

function buildPromptWithSchema(prompt: string, schema: Record<string, unknown>): string {
  const schemaStr = JSON.stringify(schema, null, 2);
  return `${prompt}

You MUST respond with ONLY valid JSON that conforms to this JSON Schema:
${schemaStr}

Output ONLY the JSON object, no other text, no markdown code blocks.`;
}

/**
 * Create a GenerateObjectFn that calls the claude CLI as subprocess.
 */
export function createCLIGenerateObjectFn(options?: CLIProviderOptions): GenerateObjectFn {
  const exec = options?.execFn ?? defaultExec;
  const timeout = options?.timeout ?? 300_000; // 5 min default

  return async (args): Promise<GenerateObjectResult> => {
    const fullPrompt = buildPromptWithSchema(args.prompt, args.schema);
    return runClaudeCode(exec, fullPrompt, timeout, args.model);
  };
}

async function runClaudeCode(
  exec: ExecFn,
  prompt: string,
  _timeout: number,
  model?: string,
): Promise<GenerateObjectResult> {
  const args = ["-p", prompt, "--verbose"];
  if (model && model !== "default") {
    args.push("--model", model);
  }

  const displayArgs = args.map((a, i) => (i === 1 ? `"<prompt ${a.length} chars>"` : a));
  process.stderr.write(`[debug] claude ${displayArgs.join(" ")}\n`);

  const { stdout } = await exec("claude", args);

  // claude --output-format json returns: { "type": "result", "result": "..." }
  let resultText: string;
  let reasoning = "";

  try {
    const envelope = JSON.parse(stdout);
    resultText = envelope.result ?? stdout;
  } catch {
    resultText = stdout;
  }

  // If the result contains text before the JSON, treat it as reasoning
  const codeBlockMatch = resultText.match(/^([\s\S]*?)```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch && codeBlockMatch[1].trim().length > 0) {
    reasoning = codeBlockMatch[1].trim();
  }

  const object = extractJSON(resultText);
  return { object, reasoning: reasoning || undefined };
}

const defaultExec: ExecFn = async (cmd, args) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    maxBuffer: 10 * 1024 * 1024, // 10MB
    timeout: 120_000, // 2 min
  });
  return { stdout, stderr };
};
