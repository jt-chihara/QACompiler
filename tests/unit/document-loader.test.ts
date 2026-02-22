import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { InputRef } from "../../src/models/workflow.js";
import { DocumentLoader } from "../../src/services/document-loader.js";

const fixturesDir = join(import.meta.dirname, "../fixtures");
const _documentsDir = join(fixturesDir, "documents");

describe("DocumentLoader", () => {
  describe("loadDocument", () => {
    it("should load a Markdown file and return its content", () => {
      const loader = new DocumentLoader(fixturesDir);
      const input: InputRef = {
        path: "documents/sample-prd.md",
        type: "prd",
        label: "prd",
      };

      const doc = loader.loadDocument(input);
      expect(doc.content).toContain("User Authentication");
      expect(doc.label).toBe("prd");
      expect(doc.type).toBe("prd");
    });

    it("should load a TypeScript source code file", () => {
      const loader = new DocumentLoader(fixturesDir);
      const input: InputRef = {
        path: "documents/sample-test-code.ts",
        type: "test-code",
        label: "tests",
      };

      const doc = loader.loadDocument(input);
      expect(doc.content).toContain("AuthService");
      expect(doc.type).toBe("test-code");
    });

    it("should infer InputType from file extension when type is not specified", () => {
      const loader = new DocumentLoader(fixturesDir);
      const input: InputRef = {
        path: "documents/sample-prd.md",
        label: "prd",
      };

      const doc = loader.loadDocument(input);
      expect(doc.type).toBe("other");
    });

    it("should use label from InputRef", () => {
      const loader = new DocumentLoader(fixturesDir);
      const input: InputRef = {
        path: "documents/sample-design-doc.md",
        type: "design-doc",
        label: "design",
      };

      const doc = loader.loadDocument(input);
      expect(doc.label).toBe("design");
    });

    it("should use filename as label when label is not specified", () => {
      const loader = new DocumentLoader(fixturesDir);
      const input: InputRef = {
        path: "documents/sample-prd.md",
        type: "prd",
      };

      const doc = loader.loadDocument(input);
      expect(doc.label).toBe("sample-prd.md");
    });

    it("should throw when file does not exist", () => {
      const loader = new DocumentLoader(fixturesDir);
      const input: InputRef = {
        path: "documents/nonexistent.md",
        type: "prd",
        label: "missing",
      };

      expect(() => loader.loadDocument(input)).toThrow(/not found|does not exist/i);
    });

    it("should throw when file is empty", () => {
      const tmpDir = join(
        tmpdir(),
        `doc-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, "empty.md"), "");

      const loader = new DocumentLoader(tmpDir);
      const input: InputRef = {
        path: "empty.md",
        type: "prd",
        label: "empty",
      };

      expect(() => loader.loadDocument(input)).toThrow(/empty/i);
    });
  });

  describe("loadAll", () => {
    it("should load all input documents and return a map by label", () => {
      const loader = new DocumentLoader(fixturesDir);
      const inputs: InputRef[] = [
        { path: "documents/sample-prd.md", type: "prd", label: "prd" },
        {
          path: "documents/sample-design-doc.md",
          type: "design-doc",
          label: "design",
        },
      ];

      const docs = loader.loadAll(inputs);
      expect(docs.size).toBe(2);
      expect(docs.get("prd")?.content).toContain("User Authentication");
      expect(docs.get("design")?.content).toContain("Authentication Module");
    });
  });
});
