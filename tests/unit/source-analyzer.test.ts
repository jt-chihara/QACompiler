import { describe, expect, it } from "vitest";
import type { CollectedSource } from "../../src/models/workflow.js";
import {
  extractSymbols,
  generateFileList,
  generateMarkdownSummary,
} from "../../src/services/source-analyzer.js";

describe("extractSymbols", () => {
  describe("TypeScript", () => {
    it("should extract exported functions", () => {
      const symbols = extractSymbols("export function greet(name: string): string {", "typescript");
      expect(symbols).toContainEqual(expect.objectContaining({ name: "greet", kind: "function" }));
    });

    it("should extract exported classes", () => {
      const symbols = extractSymbols("export class UserService {", "typescript");
      expect(symbols).toContainEqual(
        expect.objectContaining({ name: "UserService", kind: "class" }),
      );
    });

    it("should extract exported interfaces", () => {
      const symbols = extractSymbols("export interface User {", "typescript");
      expect(symbols).toContainEqual(expect.objectContaining({ name: "User", kind: "interface" }));
    });

    it("should extract exported types", () => {
      const symbols = extractSymbols("export type UserId = string;", "typescript");
      expect(symbols).toContainEqual(expect.objectContaining({ name: "UserId", kind: "type" }));
    });

    it("should extract exported consts", () => {
      const symbols = extractSymbols("export const DEFAULT_TIMEOUT = 5000;", "typescript");
      expect(symbols).toContainEqual(
        expect.objectContaining({ name: "DEFAULT_TIMEOUT", kind: "const" }),
      );
    });

    it("should extract exported enums", () => {
      const symbols = extractSymbols("export enum Status {", "typescript");
      expect(symbols).toContainEqual(expect.objectContaining({ name: "Status", kind: "enum" }));
    });

    it("should not extract non-exported symbols", () => {
      const symbols = extractSymbols("function internalHelper(): void {", "typescript");
      expect(symbols).toHaveLength(0);
    });

    it("should include line numbers", () => {
      const content = "line1\nexport function greet() {}\nline3";
      const symbols = extractSymbols(content, "typescript");
      expect(symbols[0].line).toBe(2);
    });
  });

  describe("Go", () => {
    it("should extract exported functions (capitalized)", () => {
      const symbols = extractSymbols("func HandleCreate(name string) error {", "go");
      expect(symbols).toContainEqual(
        expect.objectContaining({ name: "HandleCreate", kind: "function" }),
      );
    });

    it("should not extract unexported functions (lowercase)", () => {
      const symbols = extractSymbols("func validate(name string) bool {", "go");
      expect(symbols).toHaveLength(0);
    });

    it("should extract exported struct types", () => {
      const symbols = extractSymbols("type TodoItem struct {", "go");
      expect(symbols).toContainEqual(expect.objectContaining({ name: "TodoItem", kind: "struct" }));
    });

    it("should extract exported interface types", () => {
      const symbols = extractSymbols("type Repository interface {", "go");
      expect(symbols).toContainEqual(
        expect.objectContaining({ name: "Repository", kind: "interface" }),
      );
    });
  });

  describe("Python", () => {
    it("should extract top-level function definitions", () => {
      const symbols = extractSymbols("def create_app():", "python");
      expect(symbols).toContainEqual(
        expect.objectContaining({ name: "create_app", kind: "function" }),
      );
    });

    it("should extract class definitions", () => {
      const symbols = extractSymbols("class TodoService:", "python");
      expect(symbols).toContainEqual(
        expect.objectContaining({ name: "TodoService", kind: "class" }),
      );
    });

    it("should not extract indented (method) definitions", () => {
      const symbols = extractSymbols("    def add_todo(self, title):", "python");
      expect(symbols).toHaveLength(0);
    });
  });

  describe("unknown language", () => {
    it("should return empty array", () => {
      const symbols = extractSymbols("some content", "unknown");
      expect(symbols).toEqual([]);
    });
  });
});

describe("generateMarkdownSummary", () => {
  const sources: CollectedSource[] = [
    {
      path: "handler.go",
      content: "func HandleCreate() {}",
      language: "go",
      lineCount: 10,
      symbols: [{ name: "HandleCreate", kind: "function", line: 1 }],
    },
    {
      path: "types.ts",
      content: "export interface User {}",
      language: "typescript",
      lineCount: 5,
      symbols: [{ name: "User", kind: "interface", line: 1 }],
    },
  ];

  it("should include file count and language count in header", () => {
    const markdown = generateMarkdownSummary(sources);
    expect(markdown).toContain("2 files");
    expect(markdown).toContain("2 languages");
  });

  it("should include file paths with language and line count", () => {
    const markdown = generateMarkdownSummary(sources);
    expect(markdown).toContain("`handler.go`");
    expect(markdown).toContain("Go");
    expect(markdown).toContain("10 lines");
    expect(markdown).toContain("`types.ts`");
    expect(markdown).toContain("TypeScript");
  });

  it("should include symbol names as sub-items", () => {
    const markdown = generateMarkdownSummary(sources);
    expect(markdown).toContain("func HandleCreate");
    expect(markdown).toContain("interface User");
  });
});

describe("generateFileList", () => {
  it("should return newline-separated file paths", () => {
    const sources: CollectedSource[] = [
      { path: "a.ts", content: "", language: "typescript", lineCount: 1, symbols: [] },
      { path: "b.go", content: "", language: "go", lineCount: 1, symbols: [] },
    ];
    const list = generateFileList(sources);
    expect(list).toBe("a.ts\nb.go");
  });
});
