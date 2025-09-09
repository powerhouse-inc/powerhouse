import type { AppModuleBaseOperationsAction } from "./base-operations/actions.js";
import type { AppModuleDndOperationsAction } from "./dnd-operations/actions.js";

export * from "./base-operations/actions.js";
export * from "./dnd-operations/actions.js";

export type AppModuleAction =
  | AppModuleBaseOperationsAction
  | AppModuleDndOperationsAction;
