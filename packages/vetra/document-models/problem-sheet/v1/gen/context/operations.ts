/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type { ClearContextAction, SetContextAction } from "./actions.js";

export interface ProblemSheetContextOperations {
  setContextOperation: (
    state: ProblemSheetGlobalState,
    action: SetContextAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearContextOperation: (
    state: ProblemSheetGlobalState,
    action: ClearContextAction,
    dispatch?: SignalDispatch,
  ) => void;
}
