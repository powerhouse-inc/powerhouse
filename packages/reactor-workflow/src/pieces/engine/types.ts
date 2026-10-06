// Structural mirror of the powerhouse/workflow document state (doc 08 §5.1).
// The engine stays decoupled from the generated document-model types.
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import type { BlockResolution, StepPieceRecord } from "./resolution.js";

// `schema` is a DYNAMIC prop's resolved child props, keyed by child name.
export interface PropertySettingDef {
  prop: string;
  mode?: string;
  schema?: unknown;
}

export interface WorkflowTriggerDef {
  id: string;
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
  connectionId?: string | null;
  // A REACTOR connection, for a trigger that declares requireReactor.
  reactorConnectionId?: string | null;
  config?: unknown;
  propertySettings?: PropertySettingDef[] | null;
}

export interface WorkflowStepDef {
  id: string;
  key: string;
  name?: string;
  pieceName: string;
  pieceVersion: string;
  actionName: string;
  connectionId?: string | null;
  // A REACTOR connection, for an action that declares requireReactor.
  reactorConnectionId?: string | null;
  config: unknown;
  timeoutSeconds?: number | null;
  propertySettings?: PropertySettingDef[] | null;
  // Passed over at run time: not executed, continues on "next" with a null output.
  skip?: boolean | null;
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
  block: BlockRef;
  // Step config with expressions already resolved against the run scope.
  config: unknown;
  connectionId?: string | null;
  reactorConnectionId?: string | null;
  step: WorkflowStepDef;
  // Run-wide secret values (SECRET variables) the executor redacts as well.
  redactValues?: string[];
}

export interface BlockResult {
  output: unknown;
  // Output port routing the step's outgoing edges; defaults to "next".
  port?: string;
  // Secret values this step ran with. The live output keeps them, so the next
  // step still works; only the journaled copy has them replaced.
  redactValues?: string[];
  // The piece version this step ran, when a piece ran it.
  resolution?: BlockResolution;
}

export interface BlockExecutor {
  execute(execution: BlockExecution): Promise<BlockResult>;
}

// REPLAYED: output reused from a prior run's journal instead of executing.
// SKIPPED: never reached, or flagged `skip` (then it carries port "next").
export type StepExecutionStatus =
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "REPLAYED";

export interface StepExecutionRecord {
  stepId: string;
  key: string;
  pieceName: string;
  // The step's action, or the trigger's name for a trigger test.
  blockName: string;
  status: StepExecutionStatus;
  // Resolved config the block ran with; absent for skipped steps.
  input?: unknown;
  output?: unknown;
  port?: string;
  error?: string;
  // The thrown error's name, e.g. ReactorAccessDeniedError.
  errorName?: string;
  // ISO times the block ran between; absent for skipped and replayed steps.
  startedAt?: string;
  endedAt?: string;
  // The piece version that ran; absent for an unresolved block.
  piece?: StepPieceRecord;
  // Hash of the step definition it ran from; rerun replays only an unchanged one.
  configHash?: string;
}

export type WorkflowRunStatus = "SUCCEEDED" | "FAILED";

export interface WorkflowRunResult {
  status: WorkflowRunStatus;
  steps: StepExecutionRecord[];
  error?: string;
  errorName?: string;
  // What ran but deserves a look, e.g. an edge on a port nothing emits.
  warnings?: string[];
}

export function stepBlock(
  step: Pick<WorkflowStepDef, "pieceName" | "pieceVersion" | "actionName">,
): BlockRef {
  return {
    pieceName: step.pieceName,
    pieceVersion: step.pieceVersion,
    kind: "action",
    name: step.actionName,
  };
}

export function triggerBlock(
  trigger: Pick<
    WorkflowTriggerDef,
    "pieceName" | "pieceVersion" | "triggerName"
  >,
): BlockRef {
  return {
    pieceName: trigger.pieceName,
    pieceVersion: trigger.pieceVersion,
    kind: "trigger",
    name: trigger.triggerName,
  };
}
