import { computeInputHash } from "../lib/input-hash.js";
import { resolveSchemaPath } from "../lib/schema-resolver.js";
import { SchemaValidator } from "../lib/schema-validator.js";
import type { StepOutput } from "../models/step-output.js";
import type { LLMConfig } from "../models/workflow.js";
import type { StepExecutor } from "./dag-executor.js";
import type { GenerateObjectFn } from "./llm-runner.js";
import { LLMRunner } from "./llm-runner.js";

export interface LLMStepExecutorOptions {
  generateObjectFn: GenerateObjectFn;
  defaultLlmConfig: LLMConfig;
  baseDir: string;
}

export function createLLMStepExecutor(options: LLMStepExecutorOptions): StepExecutor {
  const runner = new LLMRunner({
    generateObjectFn: options.generateObjectFn,
  });
  const validator = new SchemaValidator();

  return async (step, resolvedPrompt, _previousOutputs): Promise<StepOutput> => {
    const llmConfig = step.llm ?? options.defaultLlmConfig;
    const schemaPath = resolveSchemaPath(step.output_schema, options.baseDir);
    const inputHash = computeInputHash(resolvedPrompt, llmConfig.model);
    const startedAt = new Date().toISOString();

    try {
      const result = await runner.runStep({
        resolvedPrompt,
        outputSchemaPath: schemaPath,
        llmConfig,
        retry: step.retry,
      });

      // Validate output against schema
      const validation = validator.validate(schemaPath, result.output);

      if (!validation.valid) {
        const errorDetails = validation.errors?.map((e) => `${e.path}: ${e.message}`).join("; ");
        return {
          step_id: step.id,
          status: "failed",
          error: {
            message: "LLM output does not conform to schema",
            details: errorDetails,
          },
          reasoning_log: result.reasoning,
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          model_used: llmConfig.model,
          input_hash: inputHash,
        };
      }

      return {
        step_id: step.id,
        status: "completed",
        output: result.output,
        reasoning_log: result.reasoning,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        model_used: llmConfig.model,
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
        model_used: llmConfig.model,
        input_hash: inputHash,
      };
    }
  };
}
