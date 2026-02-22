#!/usr/bin/env node
import { exec } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Command } from "commander";
import type { Workflow } from "../models/workflow.js";
import { createGenerateObjectFn } from "../services/ai-provider.js";
import type { ProgressCallback, StepExecutor } from "../services/dag-executor.js";
import { DAGExecutor } from "../services/dag-executor.js";
import { createLLMStepExecutor } from "../services/llm-step-executor.js";
import { OutputManager } from "../services/output-manager.js";
import { generateReport } from "../services/report-generator.js";
import type { ExecFn } from "../services/shell-step-executor.js";
import { createShellStepExecutor } from "../services/shell-step-executor.js";
import { loadWorkflow } from "../services/workflow-loader.js";

export interface CLIOptions {
  log: (message: string) => void;
  error: (message: string) => void;
  stepExecutorFactory?: () => StepExecutor;
}

export function createProgram(options?: CLIOptions): Command {
  const log = options?.log ?? console.log;
  const error = options?.error ?? console.error;

  const program = new Command();

  program.name("qa-compiler").version("0.1.0").description("AI-driven QA process engine");

  program
    .command("validate <workflow-file>")
    .description("Validate a workflow definition")
    .option("--base-dir <dir>", "Base directory for resolving paths")
    .action(async (workflowFile: string, opts: { baseDir?: string }) => {
      const workflowPath = resolve(workflowFile);
      const baseDir = opts.baseDir ? resolve(opts.baseDir) : dirname(workflowPath);

      try {
        loadWorkflow(workflowPath, baseDir);
        log(`Valid workflow: ${workflowFile}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Validation failed: ${message}`);
        program.error("", { exitCode: 1 });
      }
    });

  program
    .command("run <workflow-file>")
    .description("Execute a workflow")
    .option("-r, --resume", "Resume from last checkpoint", false)
    .option("-o, --output-dir <dir>", "Output directory")
    .option("--base-dir <dir>", "Base directory for resolving paths")
    .action(
      async (
        workflowFile: string,
        opts: { resume?: boolean; outputDir?: string; baseDir?: string },
      ) => {
        const workflowPath = resolve(workflowFile);
        const baseDir = opts.baseDir ? resolve(opts.baseDir) : dirname(workflowPath);

        let workflow: Workflow;
        try {
          workflow = loadWorkflow(workflowPath, baseDir);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          error(`Workflow validation failed: ${message}`);
          program.error("", { exitCode: 1 });
          return;
        }

        const outputDir = opts.outputDir
          ? resolve(opts.outputDir)
          : join(dirname(workflowPath), ".output");

        const defaultLlmConfig = workflow.llm ?? {
          provider: "claude-code",
          model: "claude-sonnet-4-6",
        };

        const hasShellSteps = workflow.steps.some((s) => s.type === "shell");

        let stepExecutor: StepExecutor;

        if (options?.stepExecutorFactory) {
          stepExecutor = options.stepExecutorFactory();
        } else if (hasShellSteps) {
          const llmExecutor = createLLMStepExecutor({
            generateObjectFn: createGenerateObjectFn(defaultLlmConfig.provider),
            defaultLlmConfig,
            baseDir,
          });

          const execAsync = promisify(exec);
          const execFn: ExecFn = async (command, opts) => {
            const result = await execAsync(command, {
              timeout: opts.timeout,
              env: opts.env,
              maxBuffer: 10 * 1024 * 1024,
            });
            return { stdout: result.stdout, stderr: result.stderr };
          };

          const shellExecutor = createShellStepExecutor({
            execFn,
            baseDir,
          });

          stepExecutor = (step, resolvedPrompt, previousOutputs) => {
            if (step.type === "shell") {
              return shellExecutor(step, resolvedPrompt, previousOutputs);
            }
            return llmExecutor(step, resolvedPrompt, previousOutputs);
          };
        } else {
          stepExecutor = createLLMStepExecutor({
            generateObjectFn: createGenerateObjectFn(defaultLlmConfig.provider),
            defaultLlmConfig,
            baseDir,
          });
        }

        let elapsedTimer: ReturnType<typeof setInterval> | undefined;

        const onProgress: ProgressCallback = (event) => {
          const elapsed = event.elapsedMs ? ` (${(event.elapsedMs / 1000).toFixed(1)}s)` : "";

          if (event.status === "started") {
            const prefix = `[${event.stepIndex}/${event.totalSteps}] ${event.stepName} ...`;
            process.stdout.write(`${prefix}`);

            // Show elapsed time every 5 seconds so user knows it's alive
            const startTime = Date.now();
            if (elapsedTimer) clearInterval(elapsedTimer);
            elapsedTimer = setInterval(() => {
              const sec = Math.round((Date.now() - startTime) / 1000);
              process.stdout.write(`\r${prefix} ${sec}s`);
            }, 5000);
          } else {
            if (elapsedTimer) {
              clearInterval(elapsedTimer);
              elapsedTimer = undefined;
            }

            const prefix = `[${event.stepIndex}/${event.totalSteps}] ${event.stepName}`;
            if (event.status === "completed") {
              process.stdout.write(`\r${prefix} ... done${elapsed}\n`);
            } else if (event.status === "failed") {
              process.stdout.write(`\r${prefix} ... failed${elapsed}\n`);
            } else if (event.status === "skipped") {
              process.stdout.write(`\r${prefix} ... skipped (cached)\n`);
            }
          }
        };

        const executor = new DAGExecutor({
          workflow,
          workflowPath,
          outputDir,
          stepExecutor,
          resume: opts.resume,
          baseDir,
          onProgress,
        });

        const totalSteps = workflow.steps.length;

        if (opts.resume) {
          log("Resuming workflow from previous run...");
        }

        const state = await executor.execute();

        // Generate report
        const om = new OutputManager(outputDir);
        const stepOutputs = new Map<string, import("../models/step-output.js").StepOutput>();
        const allStepIds = [
          ...state.completed_steps,
          ...(state.failed_step && !state.completed_steps.includes(state.failed_step)
            ? [state.failed_step]
            : []),
        ];
        for (const stepId of allStepIds) {
          const so = om.loadStepOutput(stepId);
          if (so) stepOutputs.set(stepId, so);
        }

        const stepNames = new Map(workflow.steps.map((s) => [s.id, s.name]));
        const report = generateReport({
          executionState: state,
          stepOutputs,
          workflowName: workflow.name,
          workflowDescription: workflow.description,
          stepNames,
        });
        om.saveReport(report);

        if (state.status === "completed") {
          log(`All steps completed successfully. (${state.completed_steps.length}/${totalSteps})`);
          log(`Output: ${outputDir}`);
        } else if (state.status === "failed") {
          error(
            `Step "${state.failed_step}" failed. Completed: ${state.completed_steps.length}/${totalSteps}`,
          );
          error(`Output: ${outputDir}`);
          program.error("", { exitCode: 2 });
        }
      },
    );

  return program;
}

// Run CLI when executed directly
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli/index.js") || process.argv[1].endsWith("/cli/index.ts"));

if (isMainModule) {
  const program = createProgram();
  program.parseAsync(process.argv).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
