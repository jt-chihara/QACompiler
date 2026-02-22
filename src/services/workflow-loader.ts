import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { topologicalSort } from "../lib/dag.js";
import { resolveSchemaPath } from "../lib/schema-resolver.js";
import { SchemaValidator } from "../lib/schema-validator.js";
import type { Workflow } from "../models/workflow.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_SCHEMA_PATH = join(__dirname, "../models/schemas/workflow-schema.json");

/**
 * Load and validate a workflow YAML file.
 *
 * @param workflowPath - Absolute path to the workflow YAML file
 * @param baseDir - Base directory for resolving relative paths (schemas, inputs)
 * @returns Validated Workflow object
 * @throws Error if YAML is invalid, schema validation fails, or circular dependency detected
 */
export function loadWorkflow(workflowPath: string, baseDir: string): Workflow {
  if (!existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`);
  }

  const content = readFileSync(workflowPath, "utf-8");
  const raw = parse(content);

  // Validate against workflow schema
  const validator = new SchemaValidator();
  const schemaPath = WORKFLOW_SCHEMA_PATH;

  // For compiled output, schema is at dist/models/schemas/workflow-schema.json
  // For tests, it's at src/models/schemas/workflow-schema.json
  let resolvedSchemaPath = schemaPath;
  if (!existsSync(resolvedSchemaPath)) {
    resolvedSchemaPath = join(__dirname, "../../src/models/schemas/workflow-schema.json");
  }

  const schemaResult = validator.validate(resolvedSchemaPath, raw);
  if (!schemaResult.valid) {
    const errorDetails = schemaResult.errors?.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`Invalid workflow definition: ${errorDetails}`);
  }

  const workflow = raw as Workflow;

  // Validate output_schema files exist
  for (const step of workflow.steps) {
    const schemaFilePath = resolveSchemaPath(step.output_schema, baseDir);
    if (!existsSync(schemaFilePath)) {
      throw new Error(`Output schema not found for step "${step.id}": ${schemaFilePath}`);
    }
  }

  // Validate sources.root directory exists
  if (workflow.sources?.root) {
    const sourcesRootPath = join(baseDir, workflow.sources.root);
    if (!existsSync(sourcesRootPath)) {
      throw new Error(`sources.root directory does not exist: ${sourcesRootPath}`);
    }
  }

  // Validate DAG (detect circular dependencies)
  const nodeIds = workflow.steps.map((s) => s.id);
  const edges = new Map<string, string[]>();
  for (const step of workflow.steps) {
    if (step.depends_on && step.depends_on.length > 0) {
      edges.set(step.id, step.depends_on);
    }
  }
  topologicalSort(nodeIds, edges);

  return workflow;
}
