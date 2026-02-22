import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { LLMConfig } from "../../src/models/workflow.js";
import { LLMRunner } from "../../src/services/llm-runner.js";

const schemasDir = join(import.meta.dirname, "../fixtures/schemas");

describe("LLMRunner", () => {
  describe("runStep", () => {
    it("should generate structured output using generateObject", async () => {
      const mockGenerateObject = vi.fn().mockResolvedValue({
        object: { summary: "Test risk analysis", risks: ["XSS", "SQL injection"] },
        reasoning: "I analyzed the PRD and found these risks.",
        usage: { totalTokens: 500 },
      });

      const llmConfig: LLMConfig = { provider: "openai", model: "gpt-4o" };
      const runner = new LLMRunner({
        generateObjectFn: mockGenerateObject,
      });

      const result = await runner.runStep({
        resolvedPrompt: "Analyze this PRD for risks",
        outputSchemaPath: join(schemasDir, "risk-analysis.json"),
        llmConfig,
      });

      expect(result.output).toEqual({
        summary: "Test risk analysis",
        risks: ["XSS", "SQL injection"],
      });
      expect(result.reasoning).toBe("I analyzed the PRD and found these risks.");
      expect(mockGenerateObject).toHaveBeenCalledOnce();
    });

    it("should use step-level LLM config when provided", async () => {
      const capturedArgs: unknown[] = [];
      const mockGenerateObject = vi.fn().mockImplementation(async (args) => {
        capturedArgs.push(args);
        return {
          object: { summary: "test", risks: [] },
          reasoning: "",
          usage: { totalTokens: 100 },
        };
      });

      const stepLlmConfig: LLMConfig = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        temperature: 0.5,
      };

      const runner = new LLMRunner({
        generateObjectFn: mockGenerateObject,
      });

      await runner.runStep({
        resolvedPrompt: "Test prompt",
        outputSchemaPath: join(schemasDir, "risk-analysis.json"),
        llmConfig: stepLlmConfig,
      });

      expect(mockGenerateObject).toHaveBeenCalledOnce();
      const callArgs = capturedArgs[0] as Record<string, unknown>;
      expect(callArgs.prompt).toBe("Test prompt");
    });

    it("should retry on failure up to max attempts", async () => {
      let callCount = 0;
      const mockGenerateObject = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error("LLM error");
        }
        return {
          object: { summary: "success after retry", risks: [] },
          reasoning: "Succeeded on attempt 3",
          usage: { totalTokens: 300 },
        };
      });

      const runner = new LLMRunner({
        generateObjectFn: mockGenerateObject,
      });

      const result = await runner.runStep({
        resolvedPrompt: "Test prompt",
        outputSchemaPath: join(schemasDir, "risk-analysis.json"),
        llmConfig: { provider: "openai", model: "gpt-4o" },
        retry: { max_attempts: 3, backoff_ms: 0 },
      });

      expect(result.output).toEqual({ summary: "success after retry", risks: [] });
      expect(callCount).toBe(3);
    });

    it("should throw after exceeding max retry attempts", async () => {
      const mockGenerateObject = vi.fn().mockRejectedValue(new Error("LLM error"));

      const runner = new LLMRunner({
        generateObjectFn: mockGenerateObject,
      });

      await expect(
        runner.runStep({
          resolvedPrompt: "Test prompt",
          outputSchemaPath: join(schemasDir, "risk-analysis.json"),
          llmConfig: { provider: "openai", model: "gpt-4o" },
          retry: { max_attempts: 2, backoff_ms: 0 },
        }),
      ).rejects.toThrow(/LLM error/);

      expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    });

    it("should default to 1 retry attempt when retry config is not provided", async () => {
      const mockGenerateObject = vi.fn().mockRejectedValue(new Error("LLM error"));

      const runner = new LLMRunner({
        generateObjectFn: mockGenerateObject,
      });

      await expect(
        runner.runStep({
          resolvedPrompt: "Test prompt",
          outputSchemaPath: join(schemasDir, "risk-analysis.json"),
          llmConfig: { provider: "openai", model: "gpt-4o" },
          retry: { backoff_ms: 0 },
        }),
      ).rejects.toThrow(/LLM error/);

      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    });
  });
});
