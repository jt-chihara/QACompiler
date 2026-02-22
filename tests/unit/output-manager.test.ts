import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionState, StepOutput } from "../../src/models/step-output.js";
import { OutputManager } from "../../src/services/output-manager.js";

describe("OutputManager", () => {
  let testDir: string;
  let manager: OutputManager;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `output-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    manager = new OutputManager(testDir);
  });

  describe("saveStepOutput", () => {
    it("should save step output to .output/{step-id}/output.json", () => {
      const output: StepOutput = {
        step_id: "risk-analysis",
        status: "completed",
        output: { summary: "test", risks: [] },
        reasoning_log: "Analyzed the PRD...",
        started_at: "2026-02-22T10:00:00Z",
        completed_at: "2026-02-22T10:00:12Z",
        model_used: "gpt-4o",
        input_hash: "abc123",
      };

      manager.saveStepOutput(output);

      const outputPath = join(testDir, "risk-analysis", "output.json");
      expect(existsSync(outputPath)).toBe(true);
      const saved = JSON.parse(readFileSync(outputPath, "utf-8"));
      expect(saved.step_id).toBe("risk-analysis");
      expect(saved.output.summary).toBe("test");
    });

    it("should save reasoning log to .output/{step-id}/reasoning.log", () => {
      const output: StepOutput = {
        step_id: "test-plan",
        status: "completed",
        output: { objectives: "test" },
        reasoning_log: "Step 1: Read the risks\nStep 2: Plan tests",
        started_at: "2026-02-22T10:00:00Z",
        completed_at: "2026-02-22T10:00:12Z",
        model_used: "gpt-4o",
        input_hash: "def456",
      };

      manager.saveStepOutput(output);

      const logPath = join(testDir, "test-plan", "reasoning.log");
      expect(existsSync(logPath)).toBe(true);
      const log = readFileSync(logPath, "utf-8");
      expect(log).toContain("Step 1: Read the risks");
    });

    it("should create output directory automatically if it does not exist", () => {
      const deepDir = join(testDir, "deep", "nested");
      const deepManager = new OutputManager(deepDir);
      const output: StepOutput = {
        step_id: "step-a",
        status: "completed",
        output: {},
        reasoning_log: "",
        started_at: "2026-02-22T10:00:00Z",
        completed_at: "2026-02-22T10:00:01Z",
        model_used: "gpt-4o",
        input_hash: "ghi789",
      };

      deepManager.saveStepOutput(output);
      expect(existsSync(join(deepDir, "step-a", "output.json"))).toBe(true);
    });
  });

  describe("loadStepOutput", () => {
    it("should load a previously saved step output", () => {
      const output: StepOutput = {
        step_id: "risk-analysis",
        status: "completed",
        output: { summary: "loaded" },
        reasoning_log: "log",
        started_at: "2026-02-22T10:00:00Z",
        completed_at: "2026-02-22T10:00:12Z",
        model_used: "gpt-4o",
        input_hash: "abc123",
      };

      manager.saveStepOutput(output);
      const loaded = manager.loadStepOutput("risk-analysis");
      expect(loaded).toBeDefined();
      expect(loaded?.output).toEqual({ summary: "loaded" });
    });

    it("should return undefined when step output does not exist", () => {
      const loaded = manager.loadStepOutput("nonexistent");
      expect(loaded).toBeUndefined();
    });
  });

  describe("ExecutionState", () => {
    it("should save and load execution state", () => {
      const state: ExecutionState = {
        workflow_path: "/path/to/workflow.yaml",
        started_at: "2026-02-22T10:00:00Z",
        completed_steps: ["risk-analysis"],
        status: "running",
      };

      manager.saveExecutionState(state);
      const loaded = manager.loadExecutionState();
      expect(loaded).toBeDefined();
      expect(loaded?.completed_steps).toEqual(["risk-analysis"]);
      expect(loaded?.status).toBe("running");
    });

    it("should return undefined when no execution state exists", () => {
      const loaded = manager.loadExecutionState();
      expect(loaded).toBeUndefined();
    });
  });
});
