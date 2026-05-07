/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ProcessorModuleAction } from "./actions.js";
import type { ProcessorModuleState as ProcessorModuleGlobalState } from "./schema/types.js";

type ProcessorModuleLocalState = Record<PropertyKey, never>;

type ProcessorModulePHState = PHBaseState & {
  global: ProcessorModuleGlobalState;
  local: ProcessorModuleLocalState;
};
type ProcessorModuleDocument = PHDocument<ProcessorModulePHState>;

export * from "./schema/types.js";

export type {
  ProcessorModuleAction,
  ProcessorModuleDocument,
  ProcessorModuleGlobalState,
  ProcessorModuleLocalState,
  ProcessorModulePHState,
};
