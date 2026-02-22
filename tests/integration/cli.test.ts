import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/cli/index.js";

const fixturesDir = join(import.meta.dirname, "../fixtures");
const workflowsDir = join(fixturesDir, "workflows");

function createTempDir(): string {
  const dir = join(tmpdir(), `cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("CLI", () => {
  describe("validate command", () => {
    it("should succeed for a valid workflow", async () => {
      const logs: string[] = [];
      const program = createProgram({
        log: (msg: string) => logs.push(msg),
        error: () => {},
      });
      program.exitOverride();

      await program.parseAsync([
        "node",
        "qa-compiler",
        "validate",
        join(workflowsDir, "single-step.yaml"),
        "--base-dir",
        fixturesDir,
      ]);

      expect(logs.some((l) => /valid/i.test(l))).toBe(true);
    });

    it("should fail for an invalid workflow", async () => {
      const errors: string[] = [];
      const program = createProgram({
        log: () => {},
        error: (msg: string) => errors.push(msg),
      });
      program.exitOverride();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          "node",
          "qa-compiler",
          "validate",
          join(workflowsDir, "invalid.yaml"),
          "--base-dir",
          fixturesDir,
        ]);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "exitCode" in err) {
          exitCode = (err as { exitCode: number }).exitCode;
        }
      }

      expect(exitCode).toBe(1);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("should fail when workflow file does not exist", async () => {
      const errors: string[] = [];
      const program = createProgram({
        log: () => {},
        error: (msg: string) => errors.push(msg),
      });
      program.exitOverride();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          "node",
          "qa-compiler",
          "validate",
          "/nonexistent/workflow.yaml",
          "--base-dir",
          fixturesDir,
        ]);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "exitCode" in err) {
          exitCode = (err as { exitCode: number }).exitCode;
        }
      }

      expect(exitCode).toBe(1);
    });
  });

  describe("run command", () => {
    it("should execute workflow and report completion", async () => {
      const logs: string[] = [];
      const outputDir = createTempDir();

      const program = createProgram({
        log: (msg: string) => logs.push(msg),
        error: () => {},
        stepExecutorFactory: () => async (step) => ({
          step_id: step.id,
          status: "completed" as const,
          output: { result: "test" },
          reasoning_log: "test log",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          model_used: "gpt-4o",
          input_hash: "test-hash",
        }),
      });
      program.exitOverride();

      await program.parseAsync([
        "node",
        "qa-compiler",
        "run",
        join(workflowsDir, "single-step.yaml"),
        "--base-dir",
        fixturesDir,
        "--output-dir",
        outputDir,
      ]);

      expect(logs.some((l) => /completed|done/i.test(l))).toBe(true);
    });

    it("should support --resume option", async () => {
      const logs: string[] = [];
      const outputDir = createTempDir();

      const program = createProgram({
        log: (msg: string) => logs.push(msg),
        error: () => {},
        stepExecutorFactory: () => async (step) => ({
          step_id: step.id,
          status: "completed" as const,
          output: { result: "test" },
          reasoning_log: "test log",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          model_used: "gpt-4o",
          input_hash: "test-hash",
        }),
      });
      program.exitOverride();

      await program.parseAsync([
        "node",
        "qa-compiler",
        "run",
        join(workflowsDir, "single-step.yaml"),
        "--base-dir",
        fixturesDir,
        "--output-dir",
        outputDir,
        "--resume",
      ]);

      expect(logs.length).toBeGreaterThan(0);
    });

    it("should support --output-dir option", async () => {
      const logs: string[] = [];
      const outputDir = createTempDir();

      const program = createProgram({
        log: (msg: string) => logs.push(msg),
        error: () => {},
        stepExecutorFactory: () => async (step) => ({
          step_id: step.id,
          status: "completed" as const,
          output: {},
          reasoning_log: "",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          model_used: "gpt-4o",
          input_hash: "hash",
        }),
      });
      program.exitOverride();

      await program.parseAsync([
        "node",
        "qa-compiler",
        "run",
        join(workflowsDir, "single-step.yaml"),
        "--base-dir",
        fixturesDir,
        "--output-dir",
        outputDir,
      ]);

      // Verify output was written to custom dir
      const { OutputManager } = await import("../../src/services/output-manager.js");
      const manager = new OutputManager(outputDir);
      const state = manager.loadExecutionState();
      expect(state).toBeDefined();
    });

    it("should exit with code 1 on workflow validation error", async () => {
      const errors: string[] = [];
      const program = createProgram({
        log: () => {},
        error: (msg: string) => errors.push(msg),
      });
      program.exitOverride();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          "node",
          "qa-compiler",
          "run",
          join(workflowsDir, "invalid.yaml"),
          "--base-dir",
          fixturesDir,
        ]);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "exitCode" in err) {
          exitCode = (err as { exitCode: number }).exitCode;
        }
      }

      expect(exitCode).toBe(1);
    });

    it("should exit with code 2 on step execution failure", async () => {
      const errors: string[] = [];
      const outputDir = createTempDir();

      const program = createProgram({
        log: () => {},
        error: (msg: string) => errors.push(msg),
        stepExecutorFactory: () => async (step) => ({
          step_id: step.id,
          status: "failed" as const,
          error: { message: "LLM call failed" },
          reasoning_log: "",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          model_used: "gpt-4o",
          input_hash: "hash",
        }),
      });
      program.exitOverride();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          "node",
          "qa-compiler",
          "run",
          join(workflowsDir, "single-step.yaml"),
          "--base-dir",
          fixturesDir,
          "--output-dir",
          outputDir,
        ]);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "exitCode" in err) {
          exitCode = (err as { exitCode: number }).exitCode;
        }
      }

      expect(exitCode).toBe(2);
    });
  });

  describe("shell step execution", () => {
    it("should execute shell steps using actual command execution", async () => {
      const logs: string[] = [];
      const outputDir = createTempDir();

      const program = createProgram({
        log: (msg: string) => logs.push(msg),
        error: () => {},
      });
      program.exitOverride();

      await program.parseAsync([
        "node",
        "qa-compiler",
        "run",
        join(workflowsDir, "shell-step.yaml"),
        "--base-dir",
        fixturesDir,
        "--output-dir",
        outputDir,
      ]);

      expect(logs.some((l) => /completed|done/i.test(l))).toBe(true);

      // Verify the output was saved
      const { OutputManager } = await import("../../src/services/output-manager.js");
      const manager = new OutputManager(outputDir);
      const output = manager.loadStepOutput("static-analysis");
      expect(output).toBeDefined();
      expect(output?.status).toBe("completed");
      expect(output?.model_used).toBe("shell");
      expect(output?.output).toHaveProperty("files");
      expect(output?.output).toHaveProperty("functions");
    });

    it("should execute mixed shell and LLM workflow", async () => {
      const logs: string[] = [];
      const outputDir = createTempDir();

      const program = createProgram({
        log: (msg: string) => logs.push(msg),
        error: () => {},
        stepExecutorFactory: () => async (step) => {
          // For LLM steps, return mock. Shell steps should be handled by the CLI.
          return {
            step_id: step.id,
            status: "completed" as const,
            output:
              step.type === "shell" ? { files: [], functions: [] } : { summary: "test", risks: [] },
            reasoning_log: "",
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            model_used: step.type === "shell" ? "shell" : "gpt-4o",
            input_hash: "test-hash",
          };
        },
      });
      program.exitOverride();

      await program.parseAsync([
        "node",
        "qa-compiler",
        "run",
        join(workflowsDir, "shell-and-llm.yaml"),
        "--base-dir",
        fixturesDir,
        "--output-dir",
        outputDir,
      ]);

      expect(logs.some((l) => /completed|done/i.test(l))).toBe(true);
    });

    it("should handle shell step failure with exit code 2", async () => {
      const errors: string[] = [];
      const outputDir = createTempDir();

      // Create a workflow yaml that has a command that will fail
      const failWorkflowDir = createTempDir();
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        join(failWorkflowDir, "fail-shell.yaml"),
        `name: fail-shell
description: Shell step that fails
inputs:
  - path: docs/prd.md
    type: prd
    label: prd
steps:
  - id: fail-step
    name: Fail Step
    type: shell
    command: exit 1
    output_schema: schemas/shell-output.json
`,
      );

      const program = createProgram({
        log: () => {},
        error: (msg: string) => errors.push(msg),
      });
      program.exitOverride();

      let exitCode: number | undefined;
      try {
        await program.parseAsync([
          "node",
          "qa-compiler",
          "run",
          join(failWorkflowDir, "fail-shell.yaml"),
          "--base-dir",
          fixturesDir,
          "--output-dir",
          outputDir,
        ]);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "exitCode" in err) {
          exitCode = (err as { exitCode: number }).exitCode;
        }
      }

      expect(exitCode).toBe(2);
    });
  });

  describe("common options", () => {
    it("should display help with --help", async () => {
      const logs: string[] = [];
      const program = createProgram({
        log: () => {},
        error: () => {},
      });
      program.exitOverride();
      program.configureOutput({
        writeOut: (str: string) => logs.push(str),
        writeErr: () => {},
      });

      try {
        await program.parseAsync(["node", "qa-compiler", "--help"]);
      } catch {
        // commander throws on --help with exitOverride
      }

      const output = logs.join("");
      expect(output).toContain("qa-compiler");
      expect(output).toContain("run");
      expect(output).toContain("validate");
    });

    it("should display version with --version", async () => {
      const logs: string[] = [];
      const program = createProgram({
        log: () => {},
        error: () => {},
      });
      program.exitOverride();
      program.configureOutput({
        writeOut: (str: string) => logs.push(str),
        writeErr: () => {},
      });

      try {
        await program.parseAsync(["node", "qa-compiler", "--version"]);
      } catch {
        // commander throws on --version with exitOverride
      }

      const output = logs.join("");
      expect(output).toContain("0.1.0");
    });
  });
});
