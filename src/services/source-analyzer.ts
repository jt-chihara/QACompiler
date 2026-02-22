import type { CollectedSource, Language, SymbolInfo } from "../models/workflow.js";

const LANGUAGE_DISPLAY: Record<Language, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  go: "Go",
  python: "Python",
  unknown: "Unknown",
};

export function extractSymbols(content: string, language: Language): SymbolInfo[] {
  const lines = content.split("\n");
  const symbols: SymbolInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (language === "typescript" || language === "javascript") {
      const tsMatch = line.match(
        /^export\s+(function|class|interface|type|const|let|var|enum)\s+(\w+)/,
      );
      if (tsMatch) {
        const kindMap: Record<string, SymbolInfo["kind"]> = {
          function: "function",
          class: "class",
          interface: "interface",
          type: "type",
          const: "const",
          let: "const",
          var: "const",
          enum: "enum",
        };
        symbols.push({ name: tsMatch[2], kind: kindMap[tsMatch[1]], line: lineNumber });
      }
    } else if (language === "go") {
      const funcMatch = line.match(/^func\s+([A-Z]\w*)\s*\(/);
      if (funcMatch) {
        symbols.push({ name: funcMatch[1], kind: "function", line: lineNumber });
      }
      const typeMatch = line.match(/^type\s+([A-Z]\w*)\s+(struct|interface)\s*\{/);
      if (typeMatch) {
        const kind = typeMatch[2] as "struct" | "interface";
        symbols.push({ name: typeMatch[1], kind, line: lineNumber });
      }
    } else if (language === "python") {
      const defMatch = line.match(/^def\s+(\w+)\s*\(/);
      if (defMatch) {
        symbols.push({ name: defMatch[1], kind: "function", line: lineNumber });
      }
      const classMatch = line.match(/^class\s+(\w+)[\s:(]/);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: "class", line: lineNumber });
      }
    }
  }

  return symbols;
}

export function generateMarkdownSummary(sources: CollectedSource[]): string {
  const languages = new Set(sources.map((s) => s.language).filter((l) => l !== "unknown"));
  const lines: string[] = [];

  lines.push(`## Source Files (${sources.length} files, ${languages.size} languages)`);
  lines.push("");

  for (const source of sources) {
    const lang = LANGUAGE_DISPLAY[source.language];
    lines.push(`- \`${source.path}\` (${lang}, ${source.lineCount} lines)`);
    for (const symbol of source.symbols) {
      const kindDisplay =
        source.language === "go" && symbol.kind === "function" ? "func" : symbol.kind;
      lines.push(`  - ${kindDisplay} ${symbol.name}`);
    }
  }

  return lines.join("\n");
}

export function generateFileList(sources: CollectedSource[]): string {
  return sources.map((s) => s.path).join("\n");
}
