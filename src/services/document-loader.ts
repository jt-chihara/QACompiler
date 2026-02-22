import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { InputRef, InputType } from "../models/workflow.js";

export interface LoadedDocument {
  content: string;
  label: string;
  type: InputType;
  path: string;
}

export class DocumentLoader {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  loadDocument(input: InputRef): LoadedDocument {
    const fullPath = join(this.baseDir, input.path);

    if (!existsSync(fullPath)) {
      throw new Error(`Input document not found: ${fullPath}`);
    }

    const content = readFileSync(fullPath, "utf-8");

    if (content.trim().length === 0) {
      throw new Error(`Input document is empty: ${fullPath}`);
    }

    return {
      content,
      label: input.label ?? basename(input.path),
      type: input.type ?? "other",
      path: input.path,
    };
  }

  loadAll(inputs: InputRef[]): Map<string, LoadedDocument> {
    const docs = new Map<string, LoadedDocument>();
    for (const input of inputs) {
      const doc = this.loadDocument(input);
      docs.set(doc.label, doc);
    }
    return docs;
  }
}
