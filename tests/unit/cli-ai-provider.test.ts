import { describe, expect, it, vi } from "vitest";
import { createCLIGenerateObjectFn, extractJSON } from "../../src/services/cli-ai-provider.js";

describe("extractJSON", () => {
  it("should extract JSON from plain JSON string", () => {
    const input = '{"summary": "test", "risks": []}';
    expect(extractJSON(input)).toEqual({ summary: "test", risks: [] });
  });

  it("should extract JSON from markdown code block", () => {
    const input = 'Here is the result:\n```json\n{"summary": "test"}\n```\n';
    expect(extractJSON(input)).toEqual({ summary: "test" });
  });

  it("should extract JSON from code block without language tag", () => {
    const input = '```\n{"summary": "test"}\n```';
    expect(extractJSON(input)).toEqual({ summary: "test" });
  });

  it("should extract JSON object embedded in text", () => {
    const input = 'Some text before\n{"summary": "test", "risks": []}\nSome text after';
    expect(extractJSON(input)).toEqual({ summary: "test", risks: [] });
  });

  it("should throw on invalid JSON", () => {
    expect(() => extractJSON("not json at all")).toThrow(/Could not extract valid JSON/);
  });
});

describe("createCLIGenerateObjectFn", () => {
  it("should call claude CLI and parse output for claude-code provider", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        result: '{"summary": "risk found", "risks": []}',
      }),
    });

    const generateObject = createCLIGenerateObjectFn({ execFn: mockExec });

    const result = await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "claude-sonnet-4-20250514",
      provider: "claude-code",
    });

    expect(result.object).toEqual({ summary: "risk found", risks: [] });
    expect(mockExec).toHaveBeenCalledOnce();

    const [cmd, args] = mockExec.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--verbose");
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-20250514");
    expect(args).not.toContain("--output-format");
    expect(args).not.toContain("--max-turns");
    // Prompt is passed as CLI arg after -p
    expect(args[args.indexOf("-p") + 1]).toContain("Analyze risks");
  });

  it("should call codex CLI for codex provider", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: '{"summary": "codex result", "risks": []}',
    });

    const generateObject = createCLIGenerateObjectFn({ execFn: mockExec });

    const result = await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "o3-mini",
      provider: "codex",
    });

    expect(result.object).toEqual({ summary: "codex result", risks: [] });
    expect(mockExec).toHaveBeenCalledOnce();

    const [cmd] = mockExec.mock.calls[0];
    expect(cmd).toBe("codex");
  });

  it("should include schema in the prompt sent to CLI", async () => {
    let capturedArgs: string[] = [];
    const mockExec = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      capturedArgs = args;
      return {
        stdout: JSON.stringify({
          type: "result",
          result: '{"summary": "test"}',
        }),
      };
    });

    const generateObject = createCLIGenerateObjectFn({ execFn: mockExec });

    await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object", required: ["summary"] },
      model: "claude-sonnet-4-20250514",
      provider: "claude-code",
    });

    // The prompt arg should contain the schema
    const promptArg = capturedArgs[capturedArgs.indexOf("-p") + 1];
    expect(promptArg).toContain('"required"');
    expect(promptArg).toContain('"summary"');
  });

  it("should not pass --model flag when model is 'default'", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        result: '{"summary": "test"}',
      }),
    });

    const generateObject = createCLIGenerateObjectFn({ execFn: mockExec });

    await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "default",
      provider: "claude-code",
    });

    const [, args] = mockExec.mock.calls[0];
    expect(args).not.toContain("--model");
  });

  it("should handle CLI execution failure", async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error("command not found: claude"));

    const generateObject = createCLIGenerateObjectFn({ execFn: mockExec });

    await expect(
      generateObject({
        prompt: "Analyze risks",
        schema: { type: "object" },
        model: "claude-sonnet-4-20250514",
        provider: "claude-code",
      }),
    ).rejects.toThrow(/command not found/);
  });

  it("should extract reasoning from claude-code output", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        result:
          'I analyzed the PRD carefully.\n\n```json\n{"summary": "risk found", "risks": []}\n```',
      }),
    });

    const generateObject = createCLIGenerateObjectFn({ execFn: mockExec });

    const result = await generateObject({
      prompt: "Analyze risks",
      schema: { type: "object" },
      model: "claude-sonnet-4-20250514",
      provider: "claude-code",
    });

    expect(result.object).toEqual({ summary: "risk found", risks: [] });
    expect(result.reasoning).toContain("I analyzed the PRD carefully");
  });
});
