/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ReactorGroupAction } from "./actions.js";
import type { ReactorGroupState as ReactorGroupGlobalState } from "./schema/types.js";

type ReactorGroupLocalState = Record<PropertyKey, never>;

type ReactorGroupPHState = PHBaseState & {
  global: ReactorGroupGlobalState;
  local: ReactorGroupLocalState;
};
type ReactorGroupDocument = PHDocument<ReactorGroupPHState>;

export * from "./schema/types.js";

export type {
  ReactorGroupAction,
  ReactorGroupDocument,
  ReactorGroupGlobalState,
  ReactorGroupLocalState,
  ReactorGroupPHState,
};
