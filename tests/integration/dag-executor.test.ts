import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { ExecutionState, StepOutput } from "../../src/models/step-output.js";
import type { Step, Workflow } from "../../src/models/workflow.js";
import type { StepExecutor } from "../../src/services/dag-executor.js";
import { DAGExecutor } from "../../src/services/dag-executor.js";
import { OutputManager } from "../../src/services/output-manager.js";

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `dag-executor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeStepOutput(stepId: string, output: Record<string, unknown> = {}): StepOutput {
  return {
    step_id: stepId,
    status: "completed",
    output,
    reasoning_log: `Reasoning for ${stepId}`,
    started_at: "2026-02-22T10:00:00Z",
    completed_at: "2026-02-22T10:00:05Z",
    model_used: "gpt-4o",
    input_hash: `hash-${stepId}`,
  };
}

function makeFailedOutput(stepId: string, message: string): StepOutput {
  return {
    step_id: stepId,
    status: "failed",
    error: { message },
    reasoning_log: `Failed reasoning for ${stepId}`,
    started_at: "2026-02-22T10:00:00Z",
    completed_at: "2026-02-22T10:00:05Z",
    model_used: "gpt-4o",
    input_hash: `hash-${stepId}`,
  };
}

const twoStepWorkflow: Workflow = {
  name: "two-step",
  inputs: [{ path: "docs/prd.md", type: "prd", label: "prd" }],
  steps: [
    {
      id: "step-a",
      name: "Step A",
      type: "risk-analysis",
      prompt_template: "Analyze {{inputs.prd}}",
      output_schema: "schemas/risk-analysis.json",
    },
    {
      id: "step-b",
      name: "Step B",
      type: "test-plan",
      depends_on: ["step-a"],
      prompt_template: "Plan tests based on {{steps.step-a.output}}",
      output_schema: "schemas/test-plan.json",
    },
  ],
};

const threeStepWorkflow: Workflow = {
  name: "three-step",
  inputs: [{ path: "docs/prd.md", type: "prd", label: "prd" }],
  steps: [
    {
      id: "step-a",
      name: "Step A",
      type: "risk-analysis",
      prompt_template: "Analyze",
      output_schema: "schemas/risk-analysis.json",
    },
    {
      id: "step-b",
      name: "Step B",
      type: "test-plan",
      depends_on: ["step-a"],
      prompt_template: "Plan",
      output_schema: "schemas/test-plan.json",
    },
    {
      id: "step-c",
      name: "Step C",
      type: "test-design",
      depends_on: ["step-b"],
      prompt_template: "Design",
      output_schema: "schemas/test-design.json",
    },
  ],
};

const shellThenLLMWorkflow: Workflow = {
  name: "shell-then-llm",
  inputs: [{ path: "docs/prd.md", type: "prd", label: "prd" }],
  steps: [
    {
      id: "shell-step",
      name: "Shell Step",
      type: "shell",
      command: 'echo \'{"data": "shell-output"}\'',
      output_schema: "schemas/shell-output.json",
      timeout_ms: 30000,
    },
    {
      id: "llm-step",
      name: "LLM Step",
      type: "custom",
      depends_on: ["shell-step"],
      prompt_template: "Analyze: {{steps.shell-step.output}}",
      output_schema: "schemas/risk-analysis.json",
    },
  ],
};

describe("DAGExecutor", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = createTempDir();
  });

  describe("sequential execution in topological order", () => {
    it("should execute steps in dependency order", async () => {
      const executionOrder: string[] = [];

      const stepExecutor: StepExecutor = async (step: Step) => {
        executionOrder.push(step.id);
        return makeStepOutput(step.id, { result: `${step.id}-done` });
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      const state = await executor.execute();

      expect(executionOrder).toEqual(["step-a", "step-b"]);
      expect(state.status).toBe("completed");
      expect(state.completed_steps).toEqual(["step-a", "step-b"]);
    });

    it("should save step outputs to files via OutputManager", async () => {
      const stepExecutor: StepExecutor = async (step: Step) => {
        return makeStepOutput(step.id, { result: `${step.id}-output` });
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      await executor.execute();

      const outputManager = new OutputManager(outputDir);
      const outputA = outputManager.loadStepOutput("step-a");
      const outputB = outputManager.loadStepOutput("step-b");

      expect(outputA).toBeDefined();
      expect(outputA?.output).toEqual({ result: "step-a-output" });
      expect(outputB).toBeDefined();
      expect(outputB?.output).toEqual({ result: "step-b-output" });
    });

    it("should pass previous step outputs to stepExecutor", async () => {
      const receivedOutputs: Map<string, Map<string, StepOutput>> = new Map();

      const stepExecutor: StepExecutor = async (
        step: Step,
        _resolvedPrompt: string,
        previousOutputs: Map<string, StepOutput>,
      ) => {
        receivedOutputs.set(step.id, new Map(previousOutputs));
        return makeStepOutput(step.id, { result: `${step.id}-done` });
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      await executor.execute();

      expect(receivedOutputs.get("step-a")?.size).toBe(0);
      expect(receivedOutputs.get("step-b")?.has("step-a")).toBe(true);
    });
  });

  describe("failure handling", () => {
    it("should stop execution on step failure and preserve completed outputs", async () => {
      const executionOrder: string[] = [];

      const stepExecutor: StepExecutor = async (step: Step) => {
        executionOrder.push(step.id);
        if (step.id === "step-b") {
          return makeFailedOutput(step.id, "LLM call failed");
        }
        return makeStepOutput(step.id, { result: `${step.id}-done` });
      };

      const executor = new DAGExecutor({
        workflow: threeStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      const state = await executor.execute();

      expect(executionOrder).toEqual(["step-a", "step-b"]);
      expect(state.status).toBe("failed");
      expect(state.failed_step).toBe("step-b");
      expect(state.completed_steps).toEqual(["step-a"]);

      const outputManager = new OutputManager(outputDir);
      const outputA = outputManager.loadStepOutput("step-a");
      expect(outputA).toBeDefined();
      expect(outputA?.status).toBe("completed");
    });

    it("should save failed step output to file", async () => {
      const stepExecutor: StepExecutor = async (step: Step) => {
        if (step.id === "step-a") {
          return makeFailedOutput(step.id, "Schema validation failed");
        }
        return makeStepOutput(step.id);
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      await executor.execute();

      const outputManager = new OutputManager(outputDir);
      const outputA = outputManager.loadStepOutput("step-a");
      expect(outputA).toBeDefined();
      expect(outputA?.status).toBe("failed");
      expect(outputA?.error?.message).toBe("Schema validation failed");
    });
  });

  describe("resume mode", () => {
    it("should skip completed steps when resume is true", async () => {
      const executionOrder: string[] = [];

      // Pre-populate step-a as completed
      const outputManager = new OutputManager(outputDir);
      outputManager.saveStepOutput(makeStepOutput("step-a", { result: "previously-completed" }));
      outputManager.saveExecutionState({
        workflow_path: "/path/to/workflow.yaml",
        started_at: "2026-02-22T09:00:00Z",
        completed_steps: ["step-a"],
        status: "failed",
        failed_step: "step-b",
      });

      const stepExecutor: StepExecutor = async (step: Step) => {
        executionOrder.push(step.id);
        return makeStepOutput(step.id, { result: `${step.id}-done` });
      };

      const executor = new DAGExecutor({
        workflow: threeStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
        resume: true,
      });

      const state = await executor.execute();

      expect(executionOrder).toEqual(["step-b", "step-c"]);
      expect(state.status).toBe("completed");
      expect(state.completed_steps).toEqual(["step-a", "step-b", "step-c"]);
    });

    it("should execute all steps when resume is false even if previous outputs exist", async () => {
      const executionOrder: string[] = [];

      // Pre-populate step-a as completed
      const outputManager = new OutputManager(outputDir);
      outputManager.saveStepOutput(makeStepOutput("step-a", { result: "old-output" }));
      outputManager.saveExecutionState({
        workflow_path: "/path/to/workflow.yaml",
        started_at: "2026-02-22T09:00:00Z",
        completed_steps: ["step-a"],
        status: "failed",
      });

      const stepExecutor: StepExecutor = async (step: Step) => {
        executionOrder.push(step.id);
        return makeStepOutput(step.id, { result: `${step.id}-fresh` });
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
        resume: false,
      });

      const state = await executor.execute();

      expect(executionOrder).toEqual(["step-a", "step-b"]);
      expect(state.status).toBe("completed");
    });

    it("should load previous outputs for skipped steps to pass to subsequent steps", async () => {
      const receivedOutputs: Map<string, Map<string, StepOutput>> = new Map();

      // Pre-populate step-a as completed
      const outputManager = new OutputManager(outputDir);
      outputManager.saveStepOutput(makeStepOutput("step-a", { result: "previous-result" }));
      outputManager.saveExecutionState({
        workflow_path: "/path/to/workflow.yaml",
        started_at: "2026-02-22T09:00:00Z",
        completed_steps: ["step-a"],
        status: "failed",
        failed_step: "step-b",
      });

      const stepExecutor: StepExecutor = async (
        step: Step,
        _resolvedPrompt: string,
        previousOutputs: Map<string, StepOutput>,
      ) => {
        receivedOutputs.set(step.id, new Map(previousOutputs));
        return makeStepOutput(step.id, { result: `${step.id}-done` });
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
        resume: true,
      });

      await executor.execute();

      // step-b should receive step-a's previous output
      const stepBOutputs = receivedOutputs.get("step-b");
      expect(stepBOutputs).toBeDefined();
      expect(stepBOutputs?.get("step-a")?.output).toEqual({ result: "previous-result" });
    });
  });

  describe("execution state management", () => {
    it("should save execution state after each step", async () => {
      const _states: ExecutionState[] = [];

      const stepExecutor: StepExecutor = async (step: Step) => {
        const result = makeStepOutput(step.id);
        // Read state after save (will be updated by executor after step completes)
        return result;
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      await executor.execute();

      const outputManager = new OutputManager(outputDir);
      const finalState = outputManager.loadExecutionState();
      expect(finalState).toBeDefined();
      expect(finalState?.status).toBe("completed");
      expect(finalState?.completed_steps).toEqual(["step-a", "step-b"]);
      expect(finalState?.workflow_path).toBe("/path/to/workflow.yaml");
    });
  });

  describe("shell step template resolution", () => {
    it("should use command as resolvedPrompt for shell steps (no prompt_template)", async () => {
      const receivedPrompts: Map<string, string> = new Map();

      const stepExecutor: StepExecutor = async (step: Step, resolvedPrompt: string) => {
        receivedPrompts.set(step.id, resolvedPrompt);
        return makeStepOutput(step.id, { data: "result" });
      };

      const executor = new DAGExecutor({
        workflow: shellThenLLMWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      await executor.execute();

      // Shell step should receive command as resolved prompt
      expect(receivedPrompts.get("shell-step")).toBe('echo \'{"data": "shell-output"}\'');
      // LLM step should receive its prompt_template
      expect(receivedPrompts.get("llm-step")).toBe("Analyze: {{steps.shell-step.output}}");
    });

    it("should execute shell steps in topological order with LLM steps", async () => {
      const executionOrder: string[] = [];

      const stepExecutor: StepExecutor = async (step: Step) => {
        executionOrder.push(step.id);
        return makeStepOutput(step.id, { data: `${step.id}-done` });
      };

      const executor = new DAGExecutor({
        workflow: shellThenLLMWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      const state = await executor.execute();

      expect(executionOrder).toEqual(["shell-step", "llm-step"]);
      expect(state.status).toBe("completed");
    });
  });

  describe("sources integration", () => {
    it("should resolve {{sources.summary}} when workflow has sources section", async () => {
      // Create a temp directory with source files
      const sourceDir = join(outputDir, "project");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "app.ts"), "export function greet() {}\nexport class App {}\n");
      writeFileSync(join(sourceDir, "utils.ts"), "export const VERSION = '1.0';\n");

      const workflowWithSources: Workflow = {
        name: "with-sources",
        inputs: [],
        sources: {
          include: ["**/*.ts"],
        },
        steps: [
          {
            id: "step-a",
            name: "Analyze code",
            type: "risk-analysis",
            prompt_template:
              "Analyze these files:\n{{sources.summary}}\n\nFile list:\n{{sources.files}}",
            output_schema: "schemas/risk-analysis.json",
          },
        ],
      };

      const receivedPrompts = new Map<string, string>();

      const stepExecutor: StepExecutor = async (step: Step, resolvedPrompt: string) => {
        receivedPrompts.set(step.id, resolvedPrompt);
        return makeStepOutput(step.id, { result: "done" });
      };

      const executor = new DAGExecutor({
        workflow: workflowWithSources,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
        baseDir: sourceDir,
      });

      const state = await executor.execute();

      expect(state.status).toBe("completed");

      const prompt = receivedPrompts.get("step-a")!;
      // {{sources.summary}} should be resolved to Markdown with file info
      expect(prompt).toContain("app.ts");
      expect(prompt).toContain("utils.ts");
      expect(prompt).toContain("TypeScript");
      // {{sources.files}} should be resolved to file list
      expect(prompt).toContain("app.ts\nutils.ts");
    });

    it('should resolve {{sources.file("path")}} to individual file content', async () => {
      const sourceDir = join(outputDir, "project2");
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(join(sourceDir, "main.py"), "def hello():\n    print('hello')\n");

      const workflowWithSources: Workflow = {
        name: "with-sources-file",
        inputs: [],
        sources: {
          include: ["**/*.py"],
        },
        steps: [
          {
            id: "step-a",
            name: "Review file",
            type: "custom",
            prompt_template: 'Review this file:\n{{sources.file("main.py")}}',
            output_schema: "schemas/review.json",
          },
        ],
      };

      const receivedPrompts = new Map<string, string>();

      const stepExecutor: StepExecutor = async (step: Step, resolvedPrompt: string) => {
        receivedPrompts.set(step.id, resolvedPrompt);
        return makeStepOutput(step.id, { result: "done" });
      };

      const executor = new DAGExecutor({
        workflow: workflowWithSources,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
        baseDir: sourceDir,
      });

      const state = await executor.execute();

      expect(state.status).toBe("completed");
      const prompt = receivedPrompts.get("step-a")!;
      expect(prompt).toContain("def hello():");
      expect(prompt).toContain("print('hello')");
    });

    it("should work without sources section (backward compatibility)", async () => {
      const stepExecutor: StepExecutor = async (step: Step) => {
        return makeStepOutput(step.id, { result: "done" });
      };

      const executor = new DAGExecutor({
        workflow: twoStepWorkflow,
        workflowPath: "/path/to/workflow.yaml",
        outputDir,
        stepExecutor,
      });

      const state = await executor.execute();

      expect(state.status).toBe("completed");
      expect(state.completed_steps).toEqual(["step-a", "step-b"]);
    });
  });
});
