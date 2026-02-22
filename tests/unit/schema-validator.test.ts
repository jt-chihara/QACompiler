import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SchemaValidator } from "../../src/lib/schema-validator.js";

describe("SchemaValidator", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `schema-validator-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  it("should validate data conforming to schema", () => {
    const schemaPath = join(testDir, "valid-schema.json");
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
        },
      }),
    );

    const validator = new SchemaValidator();
    const result = validator.validate(schemaPath, { name: "test" });
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("should return errors for non-conforming data", () => {
    const schemaPath = join(testDir, "strict-schema.json");
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: "object",
        required: ["name", "age"],
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      }),
    );

    const validator = new SchemaValidator();
    const result = validator.validate(schemaPath, { name: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("should provide detailed error messages", () => {
    const schemaPath = join(testDir, "detail-schema.json");
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
          },
        },
      }),
    );

    const validator = new SchemaValidator();
    const result = validator.validate(schemaPath, { items: [1, 2] });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]).toHaveProperty("message");
  });

  it("should throw when schema file does not exist", () => {
    const validator = new SchemaValidator();
    expect(() => validator.validate("/nonexistent/schema.json", { name: "test" })).toThrow();
  });

  it("should validate against JSON Schema draft-2020-12", () => {
    const schemaPath = join(testDir, "draft2020-schema.json");
    writeFileSync(
      schemaPath,
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        required: ["summary"],
        properties: {
          summary: { type: "string" },
        },
      }),
    );

    const validator = new SchemaValidator();
    const result = validator.validate(schemaPath, { summary: "test" });
    expect(result.valid).toBe(true);
  });
});
