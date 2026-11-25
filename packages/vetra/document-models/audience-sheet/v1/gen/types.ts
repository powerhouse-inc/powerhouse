/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { AudienceSheetAction } from "./actions.js";
import type { AudienceSheetState as AudienceSheetGlobalState } from "./schema/types.js";

type AudienceSheetLocalState = Record<PropertyKey, never>;

type AudienceSheetPHState = PHBaseState & {
  global: AudienceSheetGlobalState;
  local: AudienceSheetLocalState;
};
type AudienceSheetDocument = PHDocument<AudienceSheetPHState>;

export * from "./schema/types.js";

export type {
  AudienceSheetAction,
  AudienceSheetDocument,
  AudienceSheetGlobalState,
  AudienceSheetLocalState,
  AudienceSheetPHState,
};
