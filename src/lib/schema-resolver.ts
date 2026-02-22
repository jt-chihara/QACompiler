import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUILTIN_PREFIX = "builtin:";

const BUILTIN_NAMES = new Set(["risk-analysis", "test-plan", "test-analysis", "test-design"]);

function getBuiltinDir(): string {
  // For compiled output: dist/lib/ → dist/models/schemas/builtin/
  // For source/tests: src/lib/ → src/models/schemas/builtin/
  const candidate = join(__dirname, "../models/schemas/builtin");
  if (existsSync(candidate)) {
    return candidate;
  }
  return join(__dirname, "../../src/models/schemas/builtin");
}

export function isBuiltinSchema(schemaRef: string): boolean {
  return schemaRef.startsWith(BUILTIN_PREFIX);
}

export function resolveSchemaPath(schemaRef: string, baseDir: string): string {
  if (!isBuiltinSchema(schemaRef)) {
    return join(baseDir, schemaRef);
  }

  const name = schemaRef.slice(BUILTIN_PREFIX.length);
  if (!BUILTIN_NAMES.has(name)) {
    throw new Error(
      `Unknown builtin schema: "${name}". Available: ${[...BUILTIN_NAMES].join(", ")}`,
    );
  }

  return join(getBuiltinDir(), `${name}.json`);
}
