import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LLMConfig } from "../../src/models/workflow.js";
import { DAGExecutor } from "../../src/services/dag-executor.js";
import type { GenerateObjectFn } from "../../src/services/llm-runner.js";
import { createLLMStepExecutor } from "../../src/services/llm-step-executor.js";
import { OutputManager } from "../../src/services/output-manager.js";
import { loadWorkflow } from "../../src/services/workflow-loader.js";

const fixturesDir = join(import.meta.dirname, "../fixtures");
const workflowsDir = join(fixturesDir, "workflows");

const defaultLlmConfig: LLMConfig = {
  provider: "claude-code",
  model: "claude-sonnet-4-6",
};

function createTempDir(): string {
  const dir = join(tmpdir(), `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("E2E: Workflow Execution", () => {
  it("should execute a multi-step workflow with LLM runner", async () => {
    const outputDir = createTempDir();
    const workflow = loadWorkflow(join(workflowsDir, "multi-step.yaml"), fixturesDir);

    const mockGenerateObject: GenerateObjectFn = vi.fn().mockImplementation(async (args) => {
      if (args.prompt.includes("Analyze risks")) {
        return {
          object: {
            summary: "Found 2 risks in authentication feature",
            risks: [
              { id: "R1", description: "SQL injection", severity: "high" },
              { id: "R2", description: "XSS attack", severity: "medium" },
            ],
          },
          reasoning: "Step 1: Read the PRD\nStep 2: Identified risks",
        };
      }
      // test-plan step
      return {
        object: {
          objectives: "Verify authentication security",
          test_areas: [
            { area: "SQL injection", priority: "high" },
            { area: "XSS", priority: "medium" },
          ],
        },
        reasoning: "Based on risk analysis, I planned these tests",
      };
    });

    const stepExecutor = createLLMStepExecutor({
      generateObjectFn: mockGenerateObject,
      defaultLlmConfig: workflow.llm ?? defaultLlmConfig,
      baseDir: fixturesDir,
    });

    const executor = new DAGExecutor({
      workflow,
      workflowPath: join(workflowsDir, "multi-step.yaml"),
      outputDir,
      stepExecutor,
      baseDir: fixturesDir,
    });

    const state = await executor.execute();

    // Verify execution completed
    expect(state.status).toBe("completed");
    expect(state.completed_steps).toEqual(["risk-analysis", "test-plan"]);

    // Verify outputs saved
    const outputManager = new OutputManager(outputDir);

    const riskOutput = outputManager.loadStepOutput("risk-analysis");
    expect(riskOutput).toBeDefined();
    expect(riskOutput?.status).toBe("completed");
    expect(riskOutput?.output?.summary).toBe("Found 2 risks in authentication feature");
    expect(riskOutput?.model_used).toBe("claude-sonnet-4-6");
    expect(riskOutput?.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(riskOutput?.reasoning_log).toContain("Identified risks");

    const planOutput = outputManager.loadStepOutput("test-plan");
    expect(planOutput).toBeDefined();
    expect(planOutput?.status).toBe("completed");
    expect(planOutput?.output?.objectives).toBe("Verify authentication security");

    // Verify execution state saved
    const finalState = outputManager.loadExecutionState();
    expect(finalState).toBeDefined();
    expect(finalState?.status).toBe("completed");

    // Verify LLM was called twice
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("should execute single-step workflow", async () => {
    const outputDir = createTempDir();
    const workflow = loadWorkflow(join(workflowsDir, "single-step.yaml"), fixturesDir);

    const mockGenerateObject: GenerateObjectFn = vi.fn().mockResolvedValue({
      object: {
        summary: "Risk analysis complete",
        risks: [{ id: "R1", description: "Test risk", severity: "low" }],
      },
      reasoning: "Analyzed the PRD thoroughly",
    });

    const stepExecutor = createLLMStepExecutor({
      generateObjectFn: mockGenerateObject,
      defaultLlmConfig: workflow.llm ?? defaultLlmConfig,
      baseDir: fixturesDir,
    });

    const executor = new DAGExecutor({
      workflow,
      workflowPath: join(workflowsDir, "single-step.yaml"),
      outputDir,
      stepExecutor,
      baseDir: fixturesDir,
    });

    const state = await executor.execute();

    expect(state.status).toBe("completed");
    expect(state.completed_steps).toEqual(["risk-analysis"]);

    const output = new OutputManager(outputDir).loadStepOutput("risk-analysis");
    expect(output?.status).toBe("completed");
    expect(output?.reasoning_log).toBe("Analyzed the PRD thoroughly");
  });

  it("should handle step failure gracefully", async () => {
    const outputDir = createTempDir();
    const workflow = loadWorkflow(join(workflowsDir, "multi-step.yaml"), fixturesDir);

    // Set fast retry to avoid test slowness
    for (const step of workflow.steps) {
      step.retry = { max_attempts: 1, backoff_ms: 0 };
    }

    const mockGenerateObject: GenerateObjectFn = vi
      .fn()
      .mockRejectedValue(new Error("API rate limit exceeded"));

    const stepExecutor = createLLMStepExecutor({
      generateObjectFn: mockGenerateObject,
      defaultLlmConfig: workflow.llm ?? defaultLlmConfig,
      baseDir: fixturesDir,
    });

    const executor = new DAGExecutor({
      workflow,
      workflowPath: join(workflowsDir, "multi-step.yaml"),
      outputDir,
      stepExecutor,
      baseDir: fixturesDir,
    });

    const state = await executor.execute();

    expect(state.status).toBe("failed");
    expect(state.failed_step).toBe("risk-analysis");

    const output = new OutputManager(outputDir).loadStepOutput("risk-analysis");
    expect(output?.status).toBe("failed");
    expect(output?.error?.message).toContain("API rate limit exceeded");
  });

  it("should execute workflow with sources section and resolve templates", async () => {
    const outputDir = createTempDir();
    const workflow = loadWorkflow(join(workflowsDir, "sources-e2e.yaml"), fixturesDir);

    const receivedPrompts: string[] = [];
    const mockGenerateObject: GenerateObjectFn = vi.fn().mockImplementation(async (args) => {
      receivedPrompts.push(args.prompt);
      return {
        object: {
          summary: "Code review complete",
          risks: [{ id: "R1", description: "No issues found", severity: "low" }],
        },
        reasoning: "Reviewed source code",
      };
    });

    const stepExecutor = createLLMStepExecutor({
      generateObjectFn: mockGenerateObject,
      defaultLlmConfig: workflow.llm ?? defaultLlmConfig,
      baseDir: fixturesDir,
    });

    const executor = new DAGExecutor({
      workflow,
      workflowPath: join(workflowsDir, "sources-e2e.yaml"),
      outputDir,
      stepExecutor,
      baseDir: fixturesDir,
    });

    const state = await executor.execute();

    expect(state.status).toBe("completed");
    expect(state.completed_steps).toEqual(["code-review"]);

    // Verify sources templates were resolved in the prompt
    const prompt = receivedPrompts[0];
    // {{sources.summary}} should contain file info
    expect(prompt).toContain("app.ts");
    expect(prompt).toContain("types.ts");
    expect(prompt).toContain("TypeScript");
    // {{sources.files}} should list files
    expect(prompt).toContain("app.ts\ntypes.ts");
    // {{sources.file("app.ts")}} should contain actual file content
    expect(prompt).toContain("export function greet");
    expect(prompt).toContain("export class UserService");
  });

  it("should resume from previously completed steps", async () => {
    const outputDir = createTempDir();
    const workflow = loadWorkflow(join(workflowsDir, "multi-step.yaml"), fixturesDir);

    // Pre-populate risk-analysis as completed
    const outputManager = new OutputManager(outputDir);
    outputManager.saveStepOutput({
      step_id: "risk-analysis",
      status: "completed",
      output: {
        summary: "Previously completed",
        risks: [{ id: "R1", description: "Old risk", severity: "high" }],
      },
      reasoning_log: "Previous reasoning",
      started_at: "2026-02-22T09:00:00Z",
      completed_at: "2026-02-22T09:00:10Z",
      model_used: "claude-sonnet-4-6",
      input_hash: "previous-hash",
    });
    outputManager.saveExecutionState({
      workflow_path: join(workflowsDir, "multi-step.yaml"),
      started_at: "2026-02-22T09:00:00Z",
      completed_steps: ["risk-analysis"],
      failed_step: "test-plan",
      status: "failed",
    });

    const mockGenerateObject: GenerateObjectFn = vi.fn().mockResolvedValue({
      object: {
        objectives: "New test plan",
        test_areas: [{ area: "Security testing", priority: "high" }],
      },
      reasoning: "Created test plan from previous risks",
    });

    const stepExecutor = createLLMStepExecutor({
      generateObjectFn: mockGenerateObject,
      defaultLlmConfig: workflow.llm ?? defaultLlmConfig,
      baseDir: fixturesDir,
    });

    const executor = new DAGExecutor({
      workflow,
      workflowPath: join(workflowsDir, "multi-step.yaml"),
      outputDir,
      stepExecutor,
      resume: true,
      baseDir: fixturesDir,
    });

    const state = await executor.execute();

    expect(state.status).toBe("completed");
    expect(state.completed_steps).toEqual(["risk-analysis", "test-plan"]);

    // Only test-plan should have been called (risk-analysis skipped)
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    const planOutput = outputManager.loadStepOutput("test-plan");
    expect(planOutput?.status).toBe("completed");
    expect(planOutput?.output?.objectives).toBe("New test plan");
  });
});
