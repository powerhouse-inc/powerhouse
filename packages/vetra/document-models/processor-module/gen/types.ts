import type { PHDocument, BaseStateFromDocument } from "document-model";
import type { ProcessorModuleState } from "./schema/types.js";
import type { ProcessorModuleAction } from "./actions.js";

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
