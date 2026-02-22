import { computeInputHash } from "../lib/input-hash.js";
import { resolveSchemaPath } from "../lib/schema-resolver.js";
import { SchemaValidator } from "../lib/schema-validator.js";
import type { StepOutput } from "../models/step-output.js";
import type { StepExecutor } from "./dag-executor.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type ExecFn = (
  command: string,
  options: { timeout?: number; env: Record<string, string> },
) => Promise<ExecResult>;

export interface ShellStepExecutorOptions {
  execFn: ExecFn;
  baseDir: string;
}

export function createShellStepExecutor(options: ShellStepExecutorOptions): StepExecutor {
  const validator = new SchemaValidator();

  return async (step, resolvedCommand, previousOutputs): Promise<StepOutput> => {
    const startedAt = new Date().toISOString();
    const inputHash = computeInputHash(resolvedCommand, "shell");

    // Build QA_STEP_OUTPUTS env from previous outputs
    const stepOutputsEnv: Record<string, unknown> = {};
    for (const [stepId, output] of previousOutputs) {
      stepOutputsEnv[stepId] = output.output;
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      QA_STEP_OUTPUTS: JSON.stringify(stepOutputsEnv),
    };

    try {
      const { stdout, stderr } = await options.execFn(resolvedCommand, {
        timeout: step.timeout_ms,
        env,
      });

      // Parse JSON from stdout
      let output: Record<string, unknown>;
      try {
        output = JSON.parse(stdout);
      } catch {
        return {
          step_id: step.id,
          status: "failed",
          error: {
            message: "Shell command output is not valid JSON",
            details: stdout.slice(0, 500),
          },
          reasoning_log: stderr,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          model_used: "shell",
          input_hash: inputHash,
        };
      }

      // Validate against schema
      const schemaPath = resolveSchemaPath(step.output_schema, options.baseDir);
      const validation = validator.validate(schemaPath, output);

      if (!validation.valid) {
        const errorDetails = validation.errors?.map((e) => `${e.path}: ${e.message}`).join("; ");
        return {
          step_id: step.id,
          status: "failed",
          error: {
            message: "Shell output does not conform to schema",
            details: errorDetails,
          },
          reasoning_log: stderr,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          model_used: "shell",
          input_hash: inputHash,
        };
      }

      return {
        step_id: step.id,
        status: "completed",
        output,
        reasoning_log: stderr,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        model_used: "shell",
        input_hash: inputHash,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        step_id: step.id,
        status: "failed",
        error: { message },
        reasoning_log: "",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        model_used: "shell",
        input_hash: inputHash,
      };
    }
  };
}
