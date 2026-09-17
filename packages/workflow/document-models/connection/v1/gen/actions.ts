/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { ConnectionConfigAction } from "./config/actions.js";
import type { ConnectionConnectionAction } from "./connection/actions.js";
import type { ConnectionHealthAction } from "./health/actions.js";

export * from "./config/actions.js";
export * from "./connection/actions.js";
export * from "./health/actions.js";

export type ConnectionAction =
  | ConnectionConnectionAction
  | ConnectionConfigAction
  | ConnectionHealthAction;
