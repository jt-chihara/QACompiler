import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SourceConfig } from "../../src/models/workflow.js";
import { collectSources } from "../../src/services/source-collector.js";

const fixturesDir = join(import.meta.dirname, "../fixtures/source-projects");

describe("collectSources", () => {
  it("should collect files matching include patterns", () => {
    const config: SourceConfig = {
      include: ["**/*.ts"],
    };
    const sources = collectSources(config, fixturesDir);
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(sources.every((s) => s.path.endsWith(".ts"))).toBe(true);
  });

  it("should exclude files matching exclude patterns", () => {
    const config: SourceConfig = {
      include: ["**/*.go"],
      exclude: ["**/*_test.go"],
    };
    const sources = collectSources(config, fixturesDir);
    expect(sources.some((s) => s.path.includes("handler.go"))).toBe(true);
    expect(sources.some((s) => s.path.includes("handler_test.go"))).toBe(false);
  });

  it("should use root as base directory for glob", () => {
    const config: SourceConfig = {
      root: "./typescript",
      include: ["**/*.ts"],
    };
    const sources = collectSources(config, fixturesDir);
    expect(sources.length).toBe(2);
    expect(sources.every((s) => s.path.endsWith(".ts"))).toBe(true);
  });

  it("should populate CollectedSource fields correctly", () => {
    const config: SourceConfig = {
      root: "./typescript",
      include: ["app.ts"],
    };
    const sources = collectSources(config, fixturesDir);
    expect(sources).toHaveLength(1);
    const source = sources[0];
    expect(source.path).toBe("app.ts");
    expect(source.content).toContain("export function greet");
    expect(source.language).toBe("typescript");
    expect(source.lineCount).toBeGreaterThan(0);
    expect(source.symbols).toEqual([]);
  });

  it("should throw when no files match include patterns", () => {
    const config: SourceConfig = {
      include: ["**/*.nonexistent"],
    };
    expect(() => collectSources(config, fixturesDir)).toThrow(/no files matched/i);
  });

  describe("binary file exclusion", () => {
    let tmpDir: string;

    beforeAll(() => {
      tmpDir = join(tmpdir(), `source-collector-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, "text.ts"), "export const x = 1;\n");
      writeFileSync(join(tmpDir, "binary.ts"), Buffer.from([0x00, 0x01, 0x02]));
    });

    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should exclude binary files automatically", () => {
      const config: SourceConfig = {
        include: ["**/*.ts"],
      };
      const sources = collectSources(config, tmpDir);
      expect(sources).toHaveLength(1);
      expect(sources[0].path).toBe("text.ts");
    });
  });
});
