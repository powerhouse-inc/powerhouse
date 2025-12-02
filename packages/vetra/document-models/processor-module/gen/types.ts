import type { PHDocument, PHBaseState } from "document-model";
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
  ProcessorModuleGlobalState,
  ProcessorModuleLocalState,
  ProcessorModulePHState,
  ProcessorModuleAction,
  ProcessorModuleDocument,
};
