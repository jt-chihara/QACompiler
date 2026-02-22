import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isBuiltinSchema, resolveSchemaPath } from "../../src/lib/schema-resolver.js";

describe("isBuiltinSchema", () => {
  it("should return true for builtin: prefix", () => {
    expect(isBuiltinSchema("builtin:risk-analysis")).toBe(true);
  });

  it("should return false for relative path", () => {
    expect(isBuiltinSchema("schemas/risk-analysis.json")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isBuiltinSchema("")).toBe(false);
  });
});

describe("resolveSchemaPath", () => {
  const baseDir = "/some/project";

  it("should resolve builtin:risk-analysis to bundled schema path", () => {
    const result = resolveSchemaPath("builtin:risk-analysis", baseDir);
    expect(result).toContain("src/models/schemas/builtin/risk-analysis.json");
    expect(result).not.toContain(baseDir);
  });

  it("should resolve builtin:test-plan to bundled schema path", () => {
    const result = resolveSchemaPath("builtin:test-plan", baseDir);
    expect(result).toContain("test-plan.json");
  });

  it("should resolve builtin:test-analysis to bundled schema path", () => {
    const result = resolveSchemaPath("builtin:test-analysis", baseDir);
    expect(result).toContain("test-analysis.json");
  });

  it("should resolve builtin:test-design to bundled schema path", () => {
    const result = resolveSchemaPath("builtin:test-design", baseDir);
    expect(result).toContain("test-design.json");
  });

  it("should throw for unknown builtin schema name", () => {
    expect(() => resolveSchemaPath("builtin:unknown", baseDir)).toThrow(/unknown builtin schema/i);
  });

  it("should resolve relative path using baseDir", () => {
    const result = resolveSchemaPath("schemas/risk-analysis.json", baseDir);
    expect(result).toBe(join(baseDir, "schemas/risk-analysis.json"));
  });
});
