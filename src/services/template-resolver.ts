import type { StepOutput } from "../models/step-output.js";
import type { SourceSummary } from "../models/workflow.js";
import type { LoadedDocument } from "./document-loader.js";

export class TemplateResolver {
  private readonly documents: Map<string, LoadedDocument>;
  private readonly stepOutputs: Map<string, StepOutput>;
  private readonly sourceSummary?: SourceSummary;

  constructor(
    documents: Map<string, LoadedDocument>,
    stepOutputs: Map<string, StepOutput>,
    sourceSummary?: SourceSummary,
  ) {
    this.documents = documents;
    this.stepOutputs = stepOutputs;
    this.sourceSummary = sourceSummary;
  }

  resolve(template: string): string {
    let result = template;

    // Replace {{inputs.label}} with document content
    result = result.replace(/\{\{inputs\.([^}]+)\}\}/g, (_match, label: string) => {
      const doc = this.documents.get(label);
      if (!doc) {
        throw new Error(`Undefined input reference: "${label}"`);
      }
      return doc.content;
    });

    // Replace {{steps.step-id.output}} with JSON stringified output
    result = result.replace(/\{\{steps\.([^.]+)\.output\}\}/g, (_match, stepId: string) => {
      const output = this.stepOutputs.get(stepId);
      if (!output) {
        throw new Error(`Undefined step output reference: "${stepId}"`);
      }
      return JSON.stringify(output.output, null, 2);
    });

    // Replace {{sources.file("path")}} with individual file content
    result = result.replace(/\{\{sources\.file\("([^"]+)"\)\}\}/g, (_match, filePath: string) => {
      if (!this.sourceSummary) {
        throw new Error("sources section is not defined in workflow");
      }
      const file = this.sourceSummary.files.find((f) => f.path === filePath);
      if (!file) {
        throw new Error(`File "${filePath}" is not in collected sources`);
      }
      return file.content;
    });

    // Replace {{sources.summary}} with Markdown summary
    result = result.replace(/\{\{sources\.summary\}\}/g, () => {
      if (!this.sourceSummary) {
        throw new Error("sources section is not defined in workflow");
      }
      return this.sourceSummary.markdown;
    });

    // Replace {{sources.files}} with file path list
    result = result.replace(/\{\{sources\.files\}\}/g, () => {
      if (!this.sourceSummary) {
        throw new Error("sources section is not defined in workflow");
      }
      return this.sourceSummary.fileList;
    });

    return result;
  }
}
