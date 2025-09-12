import type { PHDocument, PHBaseState } from "document-model";
import type { AppModuleAction } from "./actions.js";
import type { AppModuleState as AppModuleGlobalState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type AppModuleLocalState = Record<PropertyKey, never>;
type AppModulePHState = PHBaseState & {
  global: AppModuleGlobalState;
  local: AppModuleLocalState;
};
type AppModuleDocument = PHDocument<AppModulePHState>;

export type {
  AppModuleGlobalState,
  AppModuleLocalState,
  AppModulePHState,
  AppModuleAction,
  AppModuleDocument,
};
