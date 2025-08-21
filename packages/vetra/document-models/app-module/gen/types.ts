import type { PHDocument, BaseStateFromDocument } from "document-model";
import type { AppModuleState } from "./schema/types.js";
import type { AppModuleAction } from "./actions.js";

export { z } from "./schema/index.js";
export type * from "./schema/types.js";
type AppModuleLocalState = Record<PropertyKey, never>;
export type ExtendedappmoduleState = BaseStateFromDocument<AppModuleDocument>;
export type AppModuleDocument = PHDocument<AppModuleState, AppModuleLocalState>;
export type { AppModuleState, AppModuleLocalState, AppModuleAction };
