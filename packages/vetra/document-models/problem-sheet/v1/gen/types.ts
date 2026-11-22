/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ProblemSheetAction } from "./actions.js";
import type { ProblemSheetState as ProblemSheetGlobalState } from "./schema/types.js";

type ProblemSheetLocalState = Record<PropertyKey, never>;

type ProblemSheetPHState = PHBaseState & {
  global: ProblemSheetGlobalState;
  local: ProblemSheetLocalState;
};
type ProblemSheetDocument = PHDocument<ProblemSheetPHState>;

export * from "./schema/types.js";

export type {
  ProblemSheetAction,
  ProblemSheetDocument,
  ProblemSheetGlobalState,
  ProblemSheetLocalState,
  ProblemSheetPHState,
};
