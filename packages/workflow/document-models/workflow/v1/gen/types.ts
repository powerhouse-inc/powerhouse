/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { WorkflowAction } from "./actions.js";
import type { WorkflowState as WorkflowGlobalState } from "./schema/types.js";

type WorkflowLocalState = Record<PropertyKey, never>;

type WorkflowPHState = PHBaseState & {
  global: WorkflowGlobalState;
  local: WorkflowLocalState;
};
type WorkflowDocument = PHDocument<WorkflowPHState>;

export * from "./schema/types.js";

export type {
  WorkflowAction,
  WorkflowDocument,
  WorkflowGlobalState,
  WorkflowLocalState,
  WorkflowPHState,
};
