export type StepType =
  | "risk-analysis"
  | "test-plan"
  | "test-analysis"
  | "test-design"
  | "custom"
  | "shell";

export type InputType = "prd" | "design-doc" | "test-code" | "other";

export interface LLMConfig {
  provider: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

export interface RetryConfig {
  max_attempts?: number;
  backoff_ms?: number;
}

export type Language = "typescript" | "javascript" | "go" | "python" | "unknown";

export type SymbolKind = "function" | "class" | "type" | "interface" | "const" | "struct" | "enum";

export interface SourceConfig {
  root?: string;
  include: string[];
  exclude?: string[];
}

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  line: number;
}

export interface CollectedSource {
  path: string;
  content: string;
  language: Language;
  lineCount: number;
  symbols: SymbolInfo[];
}

export interface SourceSummary {
  files: CollectedSource[];
  markdown: string;
  fileList: string;
}

export interface InputRef {
  path: string;
  type?: InputType;
  label?: string;
}

export interface Step {
  id: string;
  name: string;
  type: StepType;
  depends_on?: string[];
  prompt_template?: string;
  output_schema: string;
  command?: string;
  timeout_ms?: number;
  llm?: LLMConfig;
  retry?: RetryConfig;
}

export interface Workflow {
  name: string;
  description?: string;
  inputs: InputRef[];
  sources?: SourceConfig;
  steps: Step[];
  llm?: LLMConfig;
}
