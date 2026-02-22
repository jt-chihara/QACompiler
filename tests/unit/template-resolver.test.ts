import { describe, expect, it } from "vitest";
import type { StepOutput } from "../../src/models/step-output.js";
import type { CollectedSource, SourceSummary } from "../../src/models/workflow.js";
import type { LoadedDocument } from "../../src/services/document-loader.js";
import { TemplateResolver } from "../../src/services/template-resolver.js";

function makeDoc(label: string, content: string): LoadedDocument {
  return { content, label, type: "prd", path: `docs/${label}.md` };
}

function makeStepOutput(stepId: string, output: Record<string, unknown>): StepOutput {
  return {
    step_id: stepId,
    status: "completed",
    output,
    reasoning_log: "",
    started_at: "2026-02-22T10:00:00Z",
    completed_at: "2026-02-22T10:00:05Z",
    model_used: "gpt-4o",
    input_hash: "hash",
  };
}

describe("TemplateResolver", () => {
  describe("resolve inputs", () => {
    it("should replace {{inputs.label}} with document content", () => {
      const docs = new Map<string, LoadedDocument>();
      docs.set("prd", makeDoc("prd", "This is the PRD content."));

      const resolver = new TemplateResolver(docs, new Map());
      const result = resolver.resolve("Analyze the following PRD:\n{{inputs.prd}}");

      expect(result).toBe("Analyze the following PRD:\nThis is the PRD content.");
    });

    it("should replace multiple input references", () => {
      const docs = new Map<string, LoadedDocument>();
      docs.set("prd", makeDoc("prd", "PRD content"));
      docs.set("design", makeDoc("design", "Design doc content"));

      const resolver = new TemplateResolver(docs, new Map());
      const result = resolver.resolve("PRD: {{inputs.prd}}\nDesign: {{inputs.design}}");

      expect(result).toBe("PRD: PRD content\nDesign: Design doc content");
    });
  });

  describe("resolve step outputs", () => {
    it("should replace {{steps.step-id.output}} with JSON stringified output", () => {
      const outputs = new Map<string, StepOutput>();
      outputs.set(
        "risk-analysis",
        makeStepOutput("risk-analysis", { risks: ["SQL injection", "XSS"] }),
      );

      const resolver = new TemplateResolver(new Map(), outputs);
      const result = resolver.resolve("Based on risks:\n{{steps.risk-analysis.output}}");

      expect(result).toContain("SQL injection");
      expect(result).toContain("XSS");
    });
  });

  describe("resolve mixed references", () => {
    it("should resolve both inputs and step outputs in the same template", () => {
      const docs = new Map<string, LoadedDocument>();
      docs.set("prd", makeDoc("prd", "User auth feature"));

      const outputs = new Map<string, StepOutput>();
      outputs.set("risk-analysis", makeStepOutput("risk-analysis", { summary: "3 risks found" }));

      const resolver = new TemplateResolver(docs, outputs);
      const result = resolver.resolve("PRD: {{inputs.prd}}\nRisks: {{steps.risk-analysis.output}}");

      expect(result).toContain("User auth feature");
      expect(result).toContain("3 risks found");
    });
  });

  describe("error handling", () => {
    it("should throw when referencing undefined input", () => {
      const resolver = new TemplateResolver(new Map(), new Map());
      expect(() => resolver.resolve("{{inputs.nonexistent}}")).toThrow(
        /undefined.*input.*nonexistent/i,
      );
    });

    it("should throw when referencing undefined step output", () => {
      const resolver = new TemplateResolver(new Map(), new Map());
      expect(() => resolver.resolve("{{steps.missing-step.output}}")).toThrow(
        /undefined.*step.*missing-step/i,
      );
    });

    it("should return template as-is when no variables exist", () => {
      const resolver = new TemplateResolver(new Map(), new Map());
      const result = resolver.resolve("No variables here.");
      expect(result).toBe("No variables here.");
    });
  });

  describe("resolve sources", () => {
    const mockSources: CollectedSource[] = [
      {
        path: "handler.go",
        content: "func HandleCreate() {}",
        language: "go",
        lineCount: 10,
        symbols: [{ name: "HandleCreate", kind: "function", line: 1 }],
      },
      {
        path: "types.ts",
        content: "export interface User {\n  id: string;\n}",
        language: "typescript",
        lineCount: 3,
        symbols: [{ name: "User", kind: "interface", line: 1 }],
      },
    ];

    const mockSourceSummary: SourceSummary = {
      files: mockSources,
      markdown:
        "## Source Files (2 files, 2 languages)\n\n- `handler.go` (Go, 10 lines)\n  - func HandleCreate\n- `types.ts` (TypeScript, 3 lines)\n  - interface User",
      fileList: "handler.go\ntypes.ts",
    };

    it("should replace {{sources.summary}} with Markdown summary", () => {
      const resolver = new TemplateResolver(new Map(), new Map(), mockSourceSummary);
      const result = resolver.resolve("Code overview:\n{{sources.summary}}");

      expect(result).toContain("## Source Files");
      expect(result).toContain("handler.go");
      expect(result).toContain("types.ts");
    });

    it("should replace {{sources.files}} with file path list", () => {
      const resolver = new TemplateResolver(new Map(), new Map(), mockSourceSummary);
      const result = resolver.resolve("Files:\n{{sources.files}}");

      expect(result).toBe("Files:\nhandler.go\ntypes.ts");
    });

    it('should replace {{sources.file("path")}} with file content', () => {
      const resolver = new TemplateResolver(new Map(), new Map(), mockSourceSummary);
      const result = resolver.resolve('Content:\n{{sources.file("types.ts")}}');

      expect(result).toBe("Content:\nexport interface User {\n  id: string;\n}");
    });

    it("should throw when referencing a file not in collected sources", () => {
      const resolver = new TemplateResolver(new Map(), new Map(), mockSourceSummary);
      expect(() => resolver.resolve('{{sources.file("nonexistent.ts")}}')).toThrow(
        /not in collected sources/i,
      );
    });

    it("should throw when sources undefined and {{sources.summary}} is used", () => {
      const resolver = new TemplateResolver(new Map(), new Map());
      expect(() => resolver.resolve("{{sources.summary}}")).toThrow(
        /sources section is not defined/i,
      );
    });

    it("should throw when sources undefined and {{sources.files}} is used", () => {
      const resolver = new TemplateResolver(new Map(), new Map());
      expect(() => resolver.resolve("{{sources.files}}")).toThrow(
        /sources section is not defined/i,
      );
    });

    it("should throw when sources undefined and {{sources.file()}} is used", () => {
      const resolver = new TemplateResolver(new Map(), new Map());
      expect(() => resolver.resolve('{{sources.file("app.ts")}}')).toThrow(
        /sources section is not defined/i,
      );
    });
  });

  describe("backward compatibility with sources", () => {
    const mockSourceSummary: SourceSummary = {
      files: [
        {
          path: "app.ts",
          content: "export const x = 1;",
          language: "typescript",
          lineCount: 1,
          symbols: [{ name: "x", kind: "const", line: 1 }],
        },
      ],
      markdown:
        "## Source Files (1 files, 1 languages)\n\n- `app.ts` (TypeScript, 1 lines)\n  - const x",
      fileList: "app.ts",
    };

    it("should resolve inputs, steps, and sources in the same template", () => {
      const docs = new Map<string, LoadedDocument>();
      docs.set("prd", makeDoc("prd", "My PRD"));

      const outputs = new Map<string, StepOutput>();
      outputs.set("analysis", makeStepOutput("analysis", { risk: "high" }));

      const resolver = new TemplateResolver(docs, outputs, mockSourceSummary);
      const result = resolver.resolve(
        "PRD: {{inputs.prd}}\nCode: {{sources.summary}}\nAnalysis: {{steps.analysis.output}}",
      );

      expect(result).toContain("My PRD");
      expect(result).toContain("## Source Files");
      expect(result).toContain('"risk"');
    });

    it("should work without sources (backward compatible)", () => {
      const docs = new Map<string, LoadedDocument>();
      docs.set("prd", makeDoc("prd", "My PRD"));

      const resolver = new TemplateResolver(docs, new Map());
      const result = resolver.resolve("PRD: {{inputs.prd}}");

      expect(result).toBe("PRD: My PRD");
    });
  });
});
