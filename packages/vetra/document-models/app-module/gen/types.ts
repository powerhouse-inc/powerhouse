import type { PHDocument } from "document-model";
import type { AppModuleAction } from "./actions.js";
import type { AppModulePHState } from "./ph-factories.js";
import type { AppModuleState } from "./schema/types.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type AppModuleLocalState = Record<PropertyKey, never>;
export type AppModuleDocument = PHDocument<AppModulePHState>;
export type { AppModuleState, AppModuleLocalState, AppModuleAction };
