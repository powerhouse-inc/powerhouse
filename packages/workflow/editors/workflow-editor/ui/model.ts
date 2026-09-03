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

export interface StepModel {
  id: string;
  key: string;
  name: string;
  blockType: string;
  connectionId: string | null;
  config: unknown;
  timeoutSeconds: number | null;
  position: PointModel | null;
}

export interface EdgeModel {
  id: string;
  from: string;
  to: string;
  port: string;
  condition: string | null;
}

export interface WorkflowModel {
  name: string;
  status: WorkflowStatusValue;
  version: number;
  trigger: TriggerModel | null;
  steps: StepModel[];
  edges: EdgeModel[];
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
  timeoutSeconds?: number;
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
  // Composite operations backing the canvas add buttons.
  insertStepOnEdge: (edgeId: string, input: AddStepInputModel) => void;
  appendStep: (fromId: string, port: string, input: AddStepInputModel) => void;
}

// Output ports a step exposes, mirroring the engine's routing semantics.
export function stepPorts(blockType: string): string[] {
  if (blockType === "core#branch") return ["true", "false", "error"];
  return ["next", "error"];
}
