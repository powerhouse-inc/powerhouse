/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type {
  ClearCoreJobAction,
  SetCoreJobAction,
  UpdateCoreJobAction,
} from "./actions.js";

export interface ProblemSheetCoreJobOperations {
  setCoreJobOperation: (
    state: ProblemSheetGlobalState,
    action: SetCoreJobAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateCoreJobOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateCoreJobAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearCoreJobOperation: (
    state: ProblemSheetGlobalState,
    action: ClearCoreJobAction,
    dispatch?: SignalDispatch,
  ) => void;
}
