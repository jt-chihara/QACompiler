import { topologicalSort } from "../lib/dag.js";
import type { ExecutionState, StepOutput } from "../models/step-output.js";
import type { SourceSummary, Step, Workflow } from "../models/workflow.js";
import type { LoadedDocument } from "./document-loader.js";
import { DocumentLoader } from "./document-loader.js";
import { OutputManager } from "./output-manager.js";
import { extractSymbols, generateFileList, generateMarkdownSummary } from "./source-analyzer.js";
import { collectSources } from "./source-collector.js";
import { TemplateResolver } from "./template-resolver.js";

export type StepExecutor = (
  step: Step,
  resolvedPrompt: string,
  previousOutputs: Map<string, StepOutput>,
) => Promise<StepOutput>;

export interface StepProgressEvent {
  stepIndex: number;
  totalSteps: number;
  stepName: string;
  status: "started" | "completed" | "failed" | "skipped";
  elapsedMs?: number;
}

export type ProgressCallback = (event: StepProgressEvent) => void;

export interface DAGExecutorOptions {
  workflow: Workflow;
  workflowPath: string;
  outputDir: string;
  stepExecutor: StepExecutor;
  resume?: boolean;
  baseDir?: string;
  onProgress?: ProgressCallback;
}

export class DAGExecutor {
  private readonly workflow: Workflow;
  private readonly workflowPath: string;
  private readonly outputManager: OutputManager;
  private readonly stepExecutor: StepExecutor;
  private readonly resume: boolean;

  private readonly baseDir: string | undefined;
  private readonly onProgress: ProgressCallback | undefined;
  private documents: Map<string, LoadedDocument> = new Map();
  private sourceSummary?: SourceSummary;

  constructor(options: DAGExecutorOptions) {
    this.workflow = options.workflow;
    this.workflowPath = options.workflowPath;
    this.outputManager = new OutputManager(options.outputDir);
    this.stepExecutor = options.stepExecutor;
    this.resume = options.resume ?? false;
    this.baseDir = options.baseDir;
    this.onProgress = options.onProgress;
  }

  async execute(): Promise<ExecutionState> {
    const nodeIds = this.workflow.steps.map((s) => s.id);
    const edges = new Map<string, string[]>();
    for (const step of this.workflow.steps) {
      if (step.depends_on && step.depends_on.length > 0) {
        edges.set(step.id, step.depends_on);
      }
    }

    const executionOrder = topologicalSort(nodeIds, edges);
    const stepMap = new Map(this.workflow.steps.map((s) => [s.id, s]));
    const outputs = new Map<string, StepOutput>();

    // Load previous state for resume
    let completedSteps: string[] = [];
    if (this.resume) {
      const previousState = this.outputManager.loadExecutionState();
      if (previousState) {
        completedSteps = [...previousState.completed_steps];
        // Load previous outputs for completed steps
        for (const stepId of completedSteps) {
          const output = this.outputManager.loadStepOutput(stepId);
          if (output) {
            outputs.set(stepId, output);
          }
        }
      }
    }

    const state: ExecutionState = {
      workflow_path: this.workflowPath,
      started_at: new Date().toISOString(),
      completed_steps: [...completedSteps],
      status: "running",
    };

    this.outputManager.saveExecutionState(state);

    // Load input documents if baseDir is provided
    if (this.baseDir) {
      const docLoader = new DocumentLoader(this.baseDir);
      this.documents = docLoader.loadAll(this.workflow.inputs);

      // Collect and analyze sources if defined
      if (this.workflow.sources) {
        const collected = collectSources(this.workflow.sources, this.baseDir);
        for (const source of collected) {
          source.symbols = extractSymbols(source.content, source.language);
        }
        this.sourceSummary = {
          files: collected,
          markdown: generateMarkdownSummary(collected),
          fileList: generateFileList(collected),
        };
      }
    }

    const totalSteps = executionOrder.length;

    for (let i = 0; i < executionOrder.length; i++) {
      const stepId = executionOrder[i];
      const step = stepMap.get(stepId)!;
      const stepIndex = i + 1;

      // Skip completed steps in resume mode
      if (this.resume && completedSteps.includes(stepId)) {
        this.onProgress?.({
          stepIndex,
          totalSteps,
          stepName: step.name,
          status: "skipped",
        });
        continue;
      }

      this.onProgress?.({
        stepIndex,
        totalSteps,
        stepName: step.name,
        status: "started",
      });

      const stepStartTime = Date.now();

      // Resolve template variables only when documents are loaded
      const templateSource = step.prompt_template ?? step.command ?? "";
      let resolvedPrompt = templateSource;
      if (this.baseDir) {
        const resolver = new TemplateResolver(this.documents, outputs, this.sourceSummary);
        resolvedPrompt = resolver.resolve(templateSource);
      }

      const result = await this.stepExecutor(step, resolvedPrompt, new Map(outputs));
      const elapsedMs = Date.now() - stepStartTime;

      this.outputManager.saveStepOutput(result);

      if (result.status === "failed") {
        this.onProgress?.({
          stepIndex,
          totalSteps,
          stepName: step.name,
          status: "failed",
          elapsedMs,
        });
        state.failed_step = stepId;
        state.status = "failed";
        this.outputManager.saveExecutionState(state);
        return state;
      }

      this.onProgress?.({
        stepIndex,
        totalSteps,
        stepName: step.name,
        status: "completed",
        elapsedMs,
      });

      outputs.set(stepId, result);
      state.completed_steps.push(stepId);
      this.outputManager.saveExecutionState(state);
    }

    state.status = "completed";
    this.outputManager.saveExecutionState(state);
    return state;
  }
}
