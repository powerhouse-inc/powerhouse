import type { PHBaseState, PHDocument } from "document-model";
import type { AppModuleAction } from "./actions.js";
import type { AppModuleState as AppModuleGlobalState } from "./schema/types.js";

export { z } from "./schema/index.js";
export * from "./schema/types.js";
type AppModuleLocalState = Record<PropertyKey, never>;
type AppModulePHState = PHBaseState & {
  global: AppModuleGlobalState;
  local: AppModuleLocalState;
};
type AppModuleDocument = PHDocument<AppModulePHState>;

export type {
  AppModuleAction,
  AppModuleDocument,
  AppModuleGlobalState,
  AppModuleLocalState,
  AppModulePHState,
};
