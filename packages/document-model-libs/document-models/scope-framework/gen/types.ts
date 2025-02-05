import type { Document, ExtendedState } from "document-model";
import type { ScopeFrameworkState } from "./schema/types";
import type { ScopeFrameworkLocalState } from "./schema/types";
import type { ScopeFrameworkAction } from "./actions.js";

export { z } from "./schema";
export type * from "./schema/types";
export type ExtendedScopeFrameworkState = ExtendedState<
  ScopeFrameworkState,
  ScopeFrameworkLocalState
>;
export type ScopeFrameworkDocument = Document<
  ScopeFrameworkState,
  ScopeFrameworkAction,
  ScopeFrameworkLocalState
>;
export { ScopeFrameworkState, ScopeFrameworkLocalState, ScopeFrameworkAction };
