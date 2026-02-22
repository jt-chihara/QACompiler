import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Step } from "../../src/models/workflow.js";
import { createShellStepExecutor } from "../../src/services/shell-step-executor.js";

const fixturesDir = join(import.meta.dirname, "../fixtures");

function makeShellStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "static-analysis",
    name: "Static Analysis",
    type: "shell",
    command: 'echo \'{"files":[],"functions":[]}\'',
    output_schema: "schemas/shell-output.json",
    ...overrides,
  };
}

describe("ShellStepExecutor", () => {
  describe("successful execution", () => {
    it("should execute command and return parsed JSON output", async () => {
      const stdout = JSON.stringify({
        files: [{ path: "src/index.ts", language: "typescript" }],
        functions: [{ name: "main", file: "src/index.ts" }],
      });

      const execFn = vi.fn().mockResolvedValue({ stdout, stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const result = await executor(
        makeShellStep(),
        'echo \'{"files":[],"functions":[]}\'',
        new Map(),
      );

      expect(result.status).toBe("completed");
      expect(result.step_id).toBe("static-analysis");
      expect(result.model_used).toBe("shell");
      expect(result.output).toEqual({
        files: [{ path: "src/index.ts", language: "typescript" }],
        functions: [{ name: "main", file: "src/index.ts" }],
      });
    });

    it("should pass resolved command to execFn", async () => {
      const stdout = JSON.stringify({ files: [], functions: [] });
      const execFn = vi.fn().mockResolvedValue({ stdout, stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const resolvedCommand = "cd /project && npx analyzer --format json";
      await executor(makeShellStep(), resolvedCommand, new Map());

      expect(execFn).toHaveBeenCalledWith(
        resolvedCommand,
        expect.objectContaining({ timeout: undefined }),
      );
    });

    it("should pass timeout_ms to execFn", async () => {
      const stdout = JSON.stringify({ files: [], functions: [] });
      const execFn = vi.fn().mockResolvedValue({ stdout, stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      await executor(makeShellStep({ timeout_ms: 60000 }), "echo test", new Map());

      expect(execFn).toHaveBeenCalledWith("echo test", expect.objectContaining({ timeout: 60000 }));
    });

    it("should store stderr in reasoning_log", async () => {
      const stdout = JSON.stringify({ files: [], functions: [] });
      const stderr = "Warning: deprecated API used";
      const execFn = vi.fn().mockResolvedValue({ stdout, stderr });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const result = await executor(makeShellStep(), "echo test", new Map());

      expect(result.reasoning_log).toBe("Warning: deprecated API used");
    });

    it("should inject QA_STEP_OUTPUTS env with previous outputs as JSON", async () => {
      const stdout = JSON.stringify({ files: [], functions: [] });
      const execFn = vi.fn().mockResolvedValue({ stdout, stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const previousOutputs = new Map([
        [
          "prev-step",
          {
            step_id: "prev-step",
            status: "completed" as const,
            output: { data: "value" },
            reasoning_log: "",
            started_at: "2026-01-01T00:00:00Z",
            completed_at: "2026-01-01T00:00:01Z",
            model_used: "gpt-4o",
            input_hash: "hash",
          },
        ],
      ]);

      await executor(makeShellStep(), "echo test", previousOutputs);

      const envPassed = execFn.mock.calls[0][1].env;
      expect(envPassed.QA_STEP_OUTPUTS).toBeDefined();
      const parsed = JSON.parse(envPassed.QA_STEP_OUTPUTS);
      expect(parsed["prev-step"].data).toBe("value");
    });
  });

  describe("schema validation", () => {
    it("should fail when output does not conform to schema", async () => {
      const stdout = JSON.stringify({ invalid: "data" });
      const execFn = vi.fn().mockResolvedValue({ stdout, stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const result = await executor(makeShellStep(), "echo test", new Map());

      expect(result.status).toBe("failed");
      expect(result.error?.message).toContain("schema");
    });
  });

  describe("error handling", () => {
    it("should fail when stdout is not valid JSON", async () => {
      const execFn = vi.fn().mockResolvedValue({ stdout: "not json", stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const result = await executor(makeShellStep(), "echo test", new Map());

      expect(result.status).toBe("failed");
      expect(result.error?.message).toContain("JSON");
    });

    it("should fail when command execution throws (non-zero exit)", async () => {
      const execFn = vi.fn().mockRejectedValue(new Error("Command failed with exit code 1"));

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const result = await executor(makeShellStep(), "echo test", new Map());

      expect(result.status).toBe("failed");
      expect(result.error?.message).toContain("exit code 1");
    });

    it("should set input_hash based on command", async () => {
      const stdout = JSON.stringify({ files: [], functions: [] });
      const execFn = vi.fn().mockResolvedValue({ stdout, stderr: "" });

      const executor = createShellStepExecutor({
        execFn,
        baseDir: fixturesDir,
      });

      const result = await executor(makeShellStep(), "echo test", new Map());

      expect(result.input_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
