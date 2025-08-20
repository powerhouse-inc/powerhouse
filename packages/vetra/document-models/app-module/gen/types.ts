import type { PHDocument, ExtendedStateFromDocument } from "document-model";
import type { AppModuleState } from "./schema/types.js";
import type { AppModuleAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type AppModuleLocalState = Record<PropertyKey, never>;
export type ExtendedAppModuleState =
  ExtendedStateFromDocument<AppModuleDocument>;
export type AppModuleDocument = PHDocument<AppModuleState, AppModuleLocalState>;
export type { AppModuleState, AppModuleLocalState, AppModuleAction };
