// Plain view model + callbacks; no document-model imports so the UI layer
// stays independent of Powerhouse document plumbing.

export type WorkflowStatusValue = "DRAFT" | "ENABLED" | "DISABLED" | "ARCHIVED";

export interface PointModel {
  x: number;
  y: number;
}

export interface TriggerModel {
  id: string;
  blockType: string;
  config: unknown;
  connectionId: string | null;
}

export type BackoffKindValue = "FIXED" | "EXPONENTIAL";

export interface RetryPolicyModel {
  maxAttempts: number;
  backoff: BackoffKindValue;
  initialDelaySeconds: number;
  maxDelaySeconds: number;
  retryOn: string[];
}

export interface StepModel {
  id: string;
  key: string;
  name: string;
  blockType: string;
  connectionId: string | null;
  config: unknown;
  retry: RetryPolicyModel | null;
  timeoutSeconds: number | null;
  idempotencyKeyExpression: string | null;
  position: PointModel | null;
}

export interface EdgeModel {
  id: string;
  from: string;
  to: string;
  port: string;
  condition: string | null;
}

export interface VariableModel {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
}

export interface WorkflowModel {
  name: string;
  status: WorkflowStatusValue;
  version: number;
  trigger: TriggerModel | null;
  steps: StepModel[];
  edges: EdgeModel[];
  variables: VariableModel[];
}

export interface AddStepInputModel {
  key: string;
  name: string;
  blockType: string;
  config: unknown;
  position?: PointModel;
}

export interface UpdateStepInputModel {
  id: string;
  key?: string;
  name?: string;
  blockType?: string;
  // null clears the step's connection.
  connectionId?: string | null;
  config?: unknown;
  // null clears each of these; undefined leaves them unchanged.
  retry?: RetryPolicyModel | null;
  timeoutSeconds?: number | null;
  idempotencyKeyExpression?: string | null;
  position?: PointModel;
}

export interface WorkflowEditorCallbacks {
  setName: (name: string) => void;
  setStatus: (status: WorkflowStatusValue) => void;
  setTrigger: (input: {
    blockType: string;
    config: unknown;
    connectionId?: string | null;
  }) => void;
  clearTrigger: () => void;
  addStep: (input: AddStepInputModel) => void;
  updateStep: (input: UpdateStepInputModel) => void;
  removeStep: (id: string) => void;
  addEdge: (input: {
    from: string;
    to: string;
    port: string;
    condition?: string;
  }) => void;
  removeEdge: (id: string) => void;
  // Upserts by key (the reducer matches existing variables on key).
  setVariable: (input: {
    id?: string;
    key: string;
    value: unknown;
    description?: string;
  }) => void;
  removeVariable: (id: string) => void;
  // Composite operations backing the canvas add buttons.
  insertStepOnEdge: (edgeId: string, input: AddStepInputModel) => void;
  appendStep: (fromId: string, port: string, input: AddStepInputModel) => void;
  // Copies a step with its config and advanced settings, detached from the
  // graph so no port ends up with two edges.
  duplicateStep: (id: string) => void;
  // Re-parents a step onto a port, keeping whatever follows it.
  moveStep: (move: {
    stepId: string;
    toParentId: string;
    port: string;
  }) => void;
}

// Slugified step key derived from a label, suffixed until it is free.
export function uniqueStepKey(taken: string[], label: string): string {
  const base =
    label
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/^_+|_+$/g, "") || "step";
  const keys = new Set(taken);
  let key = base;
  let suffix = 2;
  while (keys.has(key)) key = `${base}_${suffix++}`;
  return key;
}

// Output ports a step exposes, mirroring the engine's routing semantics.
export function stepPorts(blockType: string): string[] {
  if (blockType === "core#branch") return ["true", "false", "error"];
  return ["next", "error"];
}

// The ports that carry the flow onwards. `error` is left out: it is a failure
// route, edited separately.
export function flowPorts(blockType: string): string[] {
  return stepPorts(blockType).filter((port) => port !== "error");
}
