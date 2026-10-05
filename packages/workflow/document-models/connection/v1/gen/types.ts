/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ConnectionAction } from "./actions.js";
import type { ConnectionState as ConnectionGlobalState } from "./schema/types.js";

type ConnectionLocalState = Record<PropertyKey, never>;

type ConnectionPHState = PHBaseState & {
  global: ConnectionGlobalState;
  local: ConnectionLocalState;
};
type ConnectionDocument = PHDocument<ConnectionPHState>;

export * from "./schema/types.js";

export type {
  ConnectionAction,
  ConnectionDocument,
  ConnectionGlobalState,
  ConnectionLocalState,
  ConnectionPHState,
};
