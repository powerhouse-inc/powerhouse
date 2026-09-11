// Structural mirror of the powerhouse/workflow document state (doc 08 §5.1).
// The engine stays decoupled from the generated document-model types.

export interface WorkflowTriggerDef {
  id: string;
  blockType: string;
  connectionId?: string | null;
  config?: unknown;
  filter?: unknown;
}

export interface WorkflowStepDef {
  id: string;
  key: string;
  name?: string;
  blockType: string;
  connectionId?: string | null;
  config: unknown;
  timeoutSeconds?: number | null;
}

export interface WorkflowEdgeDef {
  id: string;
  from: string;
  to: string;
  port: string;
  condition?: string | null;
}

export interface WorkflowVariableDef {
  key: string;
  value?: unknown;
}

export interface WorkflowDefinition {
  name?: string;
  trigger?: WorkflowTriggerDef | null;
  steps: WorkflowStepDef[];
  edges: WorkflowEdgeDef[];
  variables?: WorkflowVariableDef[];
}

export interface BlockExecution {
  blockType: string;
  // Step config with expressions already resolved against the run scope.
  config: unknown;
  connectionId?: string | null;
  step: WorkflowStepDef;
}

export interface BlockResult {
  output: unknown;
  // Output port routing the step's outgoing edges; defaults to "next".
  port?: string;
  // Secret values this step ran with. The live output keeps them, so the next
  // step still works; only the journaled copy has them replaced.
  redactValues?: string[];
}

export interface BlockExecutor {
  execute(execution: BlockExecution): Promise<BlockResult>;
}

// REPLAYED: output reused from a prior run's journal instead of executing.
export type StepExecutionStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "REPLAYED";

export interface StepExecutionRecord {
  stepId: string;
  key: string;
  blockType: string;
  status: StepExecutionStatus;
  // Resolved config the block ran with; absent for skipped steps.
  input?: unknown;
  output?: unknown;
  port?: string;
  error?: string;
}

export type WorkflowRunStatus = "SUCCEEDED" | "FAILED";

export interface WorkflowRunResult {
  status: WorkflowRunStatus;
  steps: StepExecutionRecord[];
  error?: string;
}
