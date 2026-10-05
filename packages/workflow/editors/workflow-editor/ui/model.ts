// Plain view model + callbacks; no document-model imports so the UI layer
// stays independent of Powerhouse document plumbing.
import type { AddedBlock } from "./add-follow-up.js";
import type { BlockForm } from "./forms.js";

export type WorkflowStatusValue = "DRAFT" | "ENABLED" | "DISABLED" | "ARCHIVED";

export interface PointModel {
  x: number;
  y: number;
}

export type PropertyModeValue = "MANUAL" | "EXPRESSION";

export interface PropertySettingModel {
  prop: string;
  mode: PropertyModeValue;
  // A DYNAMIC prop's resolved children, options stripped.
  schema?: unknown;
}

export interface TestRecordModel {
  runId: string;
  testedAt: string;
}

// Editor bookkeeping on a step or the trigger; absent on older documents.
export interface BlockStateModel {
  propertySettings?: PropertySettingModel[] | null;
  lastTest?: TestRecordModel | null;
  updatedAt?: string | null;
}

export interface TriggerModel extends BlockStateModel {
  id: string;
  pieceName: string;
  pieceVersion: string;
  triggerName: string;
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

export interface StepModel extends BlockStateModel {
  id: string;
  key: string;
  name: string;
  pieceName: string;
  pieceVersion: string;
  actionName: string;
  connectionId: string | null;
  config: unknown;
  retry: RetryPolicyModel | null;
  timeoutSeconds: number | null;
  idempotencyKeyExpression: string | null;
  position: PointModel | null;
  skip?: boolean;
}

export interface EdgeModel {
  id: string;
  from: string;
  to: string;
  port: string;
  condition: string | null;
}

export type VariableTypeValue =
  | "TEXT"
  | "NUMBER"
  | "BOOLEAN"
  | "JSON"
  | "SECRET";

export interface VariableModel {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  // Null means untyped: the type is inferred from the value.
  type?: VariableTypeValue | null;
}

export interface PublishedModel {
  version: number;
  publishedAt: string;
}

export interface WorkflowModel {
  name: string;
  status: WorkflowStatusValue;
  version: number;
  trigger: TriggerModel | null;
  steps: StepModel[];
  edges: EdgeModel[];
  variables: VariableModel[];
  published?: PublishedModel | null;
  // Writes nothing, bookkeeping included.
  readOnly?: boolean;
}

// The side panel's id for the variables editor, beside step and trigger ids.
export const VARIABLES_VIEW = "__variables";

// Unpublished changes: never published, or edited since.
export function hasDraftChanges(
  model: Pick<WorkflowModel, "version" | "published">,
): boolean {
  return !model.published || model.published.version !== model.version;
}

export interface AddStepInputModel {
  key: string;
  name: string;
  pieceName: string;
  pieceVersion: string;
  actionName: string;
  config: unknown;
  position?: PointModel;
}

export interface UpdateStepInputModel {
  id: string;
  key?: string;
  name?: string;
  // "Update to vZ" edits only pieceVersion.
  pieceName?: string;
  pieceVersion?: string;
  actionName?: string;
  // null clears the step's connection.
  connectionId?: string | null;
  config?: unknown;
  // null clears each of these; undefined leaves them unchanged.
  retry?: RetryPolicyModel | null;
  timeoutSeconds?: number | null;
  idempotencyKeyExpression?: string | null;
  position?: PointModel;
  skip?: boolean;
}

// Field modes and DYNAMIC schemas ride along with the config edit they
// belong to; undefined leaves them as they are.
export interface ConfigExtras {
  propertySettings?: PropertySettingModel[];
}

export interface WorkflowEditorCallbacks {
  setName: (name: string) => void;
  setStatus: (status: WorkflowStatusValue) => void;
  setTrigger: (
    input: {
      pieceName: string;
      pieceVersion: string;
      triggerName: string;
      config: unknown;
      connectionId?: string | null;
    } & ConfigExtras,
  ) => AddedBlock;
  clearTrigger: () => void;
  addStep: (input: AddStepInputModel) => AddedBlock;
  updateStep: (input: UpdateStepInputModel) => void;
  setStepConfig: (id: string, config: unknown, extras?: ConfigExtras) => void;
  // Snapshots the draft and turns the workflow on; resolves once applied.
  publish: () => Promise<void>;
  discardChanges: () => void;
  removeStep: (id: string) => void;
  addEdge: (input: {
    from: string;
    to: string;
    port: string;
    condition?: string;
  }) => void;
  removeEdge: (id: string) => void;
  // Upserts by id; no id adds a variable. Keys are unique.
  setVariable: (input: {
    id?: string;
    key: string;
    value: unknown;
    description?: string;
    // Undefined leaves the type as is; null clears it.
    type?: VariableTypeValue | null;
  }) => void;
  removeVariable: (id: string) => void;
  // Composite operations backing the canvas add buttons.
  // `port` is the inserted block's own port the old edge's target hangs off.
  insertStepOnEdge: (
    edgeId: string,
    input: AddStepInputModel,
    port: string,
  ) => AddedBlock | undefined;
  appendStep: (
    fromId: string,
    port: string,
    input: AddStepInputModel,
  ) => AddedBlock;
  // Completes a block added before its form loaded: the defaults still unset
  // and the port it continues on. Nothing when the block is gone.
  completeBlock: (added: AddedBlock, form: BlockForm) => void;
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
