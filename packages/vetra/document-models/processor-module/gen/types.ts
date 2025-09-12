import type { PHDocument, PHBaseState } from "document-model";
import type { ProcessorModuleAction } from "./actions.js";
import type { ProcessorModuleState as ProcessorModuleGlobalState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type ProcessorModuleLocalState = Record<PropertyKey, never>;
type ProcessorModulePHState = PHBaseState & {
  global: ProcessorModuleGlobalState;
  local: ProcessorModuleLocalState;
};
type ProcessorModuleDocument = PHDocument<ProcessorModulePHState>;

export type {
  ProcessorModuleGlobalState,
  ProcessorModuleLocalState,
  ProcessorModulePHState,
  ProcessorModuleAction,
  ProcessorModuleDocument,
};
