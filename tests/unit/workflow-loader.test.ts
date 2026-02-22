import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkflow } from "../../src/services/workflow-loader.js";

const fixturesDir = join(import.meta.dirname, "../fixtures");
const workflowsDir = join(fixturesDir, "workflows");
const _schemasDir = join(fixturesDir, "schemas");

describe("loadWorkflow", () => {
  it("should load a valid single-step workflow YAML", () => {
    const workflow = loadWorkflow(join(workflowsDir, "single-step.yaml"), fixturesDir);
    expect(workflow.name).toBe("single-step-workflow");
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0].id).toBe("risk-analysis");
    expect(workflow.steps[0].type).toBe("risk-analysis");
    expect(workflow.inputs).toHaveLength(1);
  });

  it("should load a valid multi-step workflow with dependencies", () => {
    const workflow = loadWorkflow(join(workflowsDir, "multi-step.yaml"), fixturesDir);
    expect(workflow.name).toBe("multi-step-workflow");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[1].depends_on).toContain("risk-analysis");
  });

  it("should throw on circular dependency in workflow", () => {
    expect(() => loadWorkflow(join(workflowsDir, "circular.yaml"), fixturesDir)).toThrow(
      /circular/i,
    );
  });

  it("should throw on invalid YAML structure (missing required fields)", () => {
    expect(() => loadWorkflow(join(workflowsDir, "invalid.yaml"), fixturesDir)).toThrow();
  });

  it("should throw when workflow file does not exist", () => {
    expect(() => loadWorkflow(join(workflowsDir, "nonexistent.yaml"), fixturesDir)).toThrow();
  });

  it("should throw when referenced output_schema file does not exist", () => {
    expect(() =>
      loadWorkflow(join(workflowsDir, "single-step.yaml"), "/nonexistent/base/dir"),
    ).toThrow(/schema.*not found|does not exist/i);
  });

  it("should resolve LLM config from workflow level", () => {
    const workflow = loadWorkflow(join(workflowsDir, "single-step.yaml"), fixturesDir);
    expect(workflow.llm).toBeDefined();
    expect(workflow.llm?.provider).toBe("openai");
    expect(workflow.llm?.model).toBe("gpt-4o");
  });

  it("should parse step prompt_template correctly", () => {
    const workflow = loadWorkflow(join(workflowsDir, "single-step.yaml"), fixturesDir);
    expect(workflow.steps[0].prompt_template).toContain("{{inputs.prd}}");
  });

  it("should load a valid shell step workflow", () => {
    const workflow = loadWorkflow(join(workflowsDir, "shell-step.yaml"), fixturesDir);
    expect(workflow.name).toBe("shell-step-workflow");
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0].type).toBe("shell");
    expect(workflow.steps[0].command).toContain("echo");
    expect(workflow.steps[0].timeout_ms).toBe(30000);
    expect(workflow.steps[0].prompt_template).toBeUndefined();
  });

  it("should load a workflow with both shell and LLM steps", () => {
    const workflow = loadWorkflow(join(workflowsDir, "shell-and-llm.yaml"), fixturesDir);
    expect(workflow.name).toBe("shell-and-llm-workflow");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0].type).toBe("shell");
    expect(workflow.steps[0].command).toBeDefined();
    expect(workflow.steps[1].type).toBe("custom");
    expect(workflow.steps[1].prompt_template).toBeDefined();
  });

  it("should load a workflow with builtin: schema reference", () => {
    const workflow = loadWorkflow(join(workflowsDir, "builtin-schema.yaml"), fixturesDir);
    expect(workflow.name).toBe("builtin-schema-workflow");
    expect(workflow.steps[0].output_schema).toBe("builtin:risk-analysis");
  });

  it("should throw on unknown builtin: schema reference", () => {
    expect(() => loadWorkflow(join(workflowsDir, "builtin-unknown.yaml"), fixturesDir)).toThrow(
      /unknown builtin schema/i,
    );
  });

  describe("sources section", () => {
    it("should load a workflow with sources section", () => {
      const workflow = loadWorkflow(join(workflowsDir, "with-sources.yaml"), fixturesDir);
      expect(workflow.name).toBe("sources-workflow");
      expect(workflow.sources).toBeDefined();
      expect(workflow.sources!.include).toEqual(["**/*.ts"]);
      expect(workflow.sources!.exclude).toEqual(["**/*.test.ts"]);
    });

    it("should load a workflow without sources section (backward compatibility)", () => {
      const workflow = loadWorkflow(join(workflowsDir, "single-step.yaml"), fixturesDir);
      expect(workflow.sources).toBeUndefined();
    });

    it("should throw when sources.include is missing", () => {
      expect(() =>
        loadWorkflow(join(workflowsDir, "with-sources-no-include.yaml"), fixturesDir),
      ).toThrow();
    });

    it("should load a workflow with sources.root specified", () => {
      const workflow = loadWorkflow(join(workflowsDir, "with-sources-root.yaml"), fixturesDir);
      expect(workflow.sources!.root).toBe("./source-projects/typescript");
    });

    it("should throw when sources.root directory does not exist", () => {
      expect(() =>
        loadWorkflow(join(workflowsDir, "with-sources-bad-root.yaml"), fixturesDir),
      ).toThrow(/sources\.root.*does not exist|not found/i);
    });
  });
});
