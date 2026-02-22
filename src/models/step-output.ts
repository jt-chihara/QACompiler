export type ExecutionStatus = "completed" | "failed";

export type WorkflowStatus = "running" | "completed" | "failed";

export interface ErrorInfo {
  message: string;
  details?: string;
}

export interface StepOutput {
  step_id: string;
  status: ExecutionStatus;
  output?: Record<string, unknown>;
  error?: ErrorInfo;
  reasoning_log: string;
  started_at: string;
  completed_at: string;
  model_used: string;
  input_hash: string;
}

export interface ExecutionState {
  workflow_path: string;
  started_at: string;
  completed_steps: string[];
  failed_step?: string;
  status: WorkflowStatus;
}
