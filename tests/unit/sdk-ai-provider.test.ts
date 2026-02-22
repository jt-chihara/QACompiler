import { describe, expect, it } from "vitest";
import type { SDKQueryFn, SDKResultLike } from "../../src/services/sdk-ai-provider.js";
import { createSDKGenerateObjectFn } from "../../src/services/sdk-ai-provider.js";

function createMockQueryFn(result: string): SDKQueryFn {
  return async function* (_params): AsyncGenerator<SDKResultLike, void> {
    yield {
      type: "result",
      subtype: "success",
      result,
    };
  };
}

describe("createSDKGenerateObjectFn", () => {
  it("should parse JSON result from SDK", async () => {
    const queryFn = createMockQueryFn('{"summary": "risk found", "risks": []}');

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    const result = await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "claude-sonnet-4-6",
      provider: "claude-code",
    });

    expect(result.object).toEqual({ summary: "risk found", risks: [] });
  });

  it("should extract JSON from markdown code block", async () => {
    const queryFn = createMockQueryFn(
      'Here is the analysis:\n\n```json\n{"summary": "test", "risks": []}\n```',
    );

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    const result = await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "claude-sonnet-4-6",
      provider: "claude-code",
    });

    expect(result.object).toEqual({ summary: "test", risks: [] });
  });

  it("should pass correct options to query function", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: SDKQueryFn = async function* (params): AsyncGenerator<SDKResultLike, void> {
      capturedOptions = params.options as Record<string, unknown>;
      yield { type: "result", subtype: "success", result: '{"summary": "test"}' };
    };

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "claude-sonnet-4-6",
      provider: "claude-code",
    });

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!.tools).toEqual([]);
    expect(capturedOptions!.maxTurns).toBe(1);
    expect(capturedOptions!.model).toBe("claude-sonnet-4-6");
    expect(capturedOptions!.persistSession).toBe(false);
    expect(capturedOptions!.thinking).toEqual({ type: "disabled" });
  });

  it("should not pass model when set to 'default'", async () => {
    let capturedOptions: Record<string, unknown> | undefined;

    const queryFn: SDKQueryFn = async function* (params): AsyncGenerator<SDKResultLike, void> {
      capturedOptions = params.options as Record<string, unknown>;
      yield { type: "result", subtype: "success", result: '{"summary": "test"}' };
    };

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "default",
      provider: "claude-code",
    });

    expect(capturedOptions!.model).toBeUndefined();
  });

  it("should include schema in the prompt", async () => {
    let capturedPrompt = "";

    const queryFn: SDKQueryFn = async function* (params): AsyncGenerator<SDKResultLike, void> {
      capturedPrompt = params.prompt;
      yield { type: "result", subtype: "success", result: '{"summary": "test"}' };
    };

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object", required: ["summary"] },
      model: "claude-sonnet-4-6",
      provider: "claude-code",
    });

    expect(capturedPrompt).toContain("Analyze risks");
    expect(capturedPrompt).toContain('"required"');
    expect(capturedPrompt).toContain('"summary"');
  });

  it("should throw when no result is returned", async () => {
    const queryFn: SDKQueryFn = async function* (_params): AsyncGenerator<SDKResultLike, void> {
      yield { type: "system", subtype: "init" };
    };

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    await expect(
      generateObject({
        prompt: "Analyze risks",
        schema: { type: "object" },
        model: "claude-sonnet-4-6",
        provider: "claude-code",
      }),
    ).rejects.toThrow(/no result/);
  });

  it("should throw on invalid JSON result", async () => {
    const queryFn = createMockQueryFn("This is not JSON at all");

    const generateObject = createSDKGenerateObjectFn({ queryFn });

    await expect(
      generateObject({
        prompt: "Analyze risks",
        schema: { type: "object" },
        model: "claude-sonnet-4-6",
        provider: "claude-code",
      }),
    ).rejects.toThrow(/Could not extract valid JSON/);
  });
});
