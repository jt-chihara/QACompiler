import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export class SchemaValidator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ajv: any;

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true });
    addFormats(this.ajv);
  }

  validate(schemaPath: string, data: unknown): ValidationResult {
    const schemaContent = readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { valid: true };
    }

    const errors: ValidationError[] = (validate.errors ?? []).map(
      (err: { instancePath?: string; message?: string }) => ({
        path: err.instancePath || "/",
        message: err.message ?? "Unknown validation error",
      }),
    );

    return { valid: false, errors };
  }
}
