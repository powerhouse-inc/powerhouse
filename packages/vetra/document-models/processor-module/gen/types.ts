import type { PHDocument } from "document-model";
import type { ProcessorModuleAction } from "./actions.js";
import type { ProcessorModulePHState } from "./ph-factories.js";
import type { ProcessorModuleState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type ProcessorModuleLocalState = Record<PropertyKey, never>;
export type ExtendedprocessormoduleState =
  BaseStateFromDocument<ProcessorModuleDocument>;
export type ProcessorModuleDocument = PHDocument<
  ProcessorModuleState,
  ProcessorModuleLocalState
>;
export type {
  ProcessorModuleState,
  ProcessorModuleLocalState,
  ProcessorModuleAction,
};
