import { globSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { detectLanguage } from "../lib/language-detector.js";
import type { CollectedSource, SourceConfig } from "../models/workflow.js";

function isBinary(buffer: Buffer): boolean {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0x00) {
      return true;
    }
  }
  return false;
}

export function collectSources(config: SourceConfig, baseDir: string): CollectedSource[] {
  const root = config.root ? join(baseDir, config.root) : baseDir;
  const exclude = config.exclude ?? [];

  const matchedPaths = new Set<string>();
  for (const pattern of config.include) {
    const files = globSync(pattern, { cwd: root });
    for (const file of files) {
      matchedPaths.add(file);
    }
  }

  // Apply exclude patterns
  for (const pattern of exclude) {
    const excluded = globSync(pattern, { cwd: root });
    for (const file of excluded) {
      matchedPaths.delete(file);
    }
  }

  if (matchedPaths.size === 0) {
    throw new Error(`No files matched sources.include patterns: ${config.include.join(", ")}`);
  }

  const sources: CollectedSource[] = [];
  const sortedPaths = [...matchedPaths].sort();

  for (const filePath of sortedPaths) {
    const fullPath = join(root, filePath);
    const buffer = readFileSync(fullPath);

    if (isBinary(buffer)) {
      continue;
    }

    const content = buffer.toString("utf-8");
    const relativePath = config.root ? relative(join(baseDir, config.root), fullPath) : filePath;

    sources.push({
      path: relativePath,
      content,
      language: detectLanguage(filePath),
      lineCount: content.split("\n").length,
      symbols: [],
    });
  }

  if (sources.length === 0) {
    throw new Error(`No files matched sources.include patterns: ${config.include.join(", ")}`);
  }

  return sources;
}
