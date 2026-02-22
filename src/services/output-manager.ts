import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExecutionState, StepOutput } from "../models/step-output.js";

export class OutputManager {
  private readonly outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  saveStepOutput(output: StepOutput): void {
    const stepDir = join(this.outputDir, output.step_id);
    mkdirSync(stepDir, { recursive: true });

    const outputPath = join(stepDir, "output.json");
    writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

    if (output.reasoning_log) {
      const logPath = join(stepDir, "reasoning.log");
      writeFileSync(logPath, output.reasoning_log, "utf-8");
    }
  }

  loadStepOutput(stepId: string): StepOutput | undefined {
    const outputPath = join(this.outputDir, stepId, "output.json");
    if (!existsSync(outputPath)) {
      return undefined;
    }
    const content = readFileSync(outputPath, "utf-8");
    return JSON.parse(content) as StepOutput;
  }

  saveExecutionState(state: ExecutionState): void {
    mkdirSync(this.outputDir, { recursive: true });
    const statePath = join(this.outputDir, "execution-state.json");
    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  }

  loadExecutionState(): ExecutionState | undefined {
    const statePath = join(this.outputDir, "execution-state.json");
    if (!existsSync(statePath)) {
      return undefined;
    }
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as ExecutionState;
  }

  saveReport(content: string): string {
    mkdirSync(this.outputDir, { recursive: true });
    const reportPath = join(this.outputDir, "report.md");
    writeFileSync(reportPath, content, "utf-8");
    return resolve(reportPath);
  }
}
