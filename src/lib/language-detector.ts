import { extname } from "node:path";
import type { Language } from "../models/workflow.js";

const EXTENSION_MAP: Record<string, Language> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".go": "go",
  ".py": "python",
};

export function detectLanguage(filePath: string): Language {
  const ext = extname(filePath);
  return EXTENSION_MAP[ext] ?? "unknown";
}
