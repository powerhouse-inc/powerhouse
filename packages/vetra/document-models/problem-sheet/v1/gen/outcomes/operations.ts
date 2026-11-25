/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type {
  AddOutcomeAction,
  ClearOutcomeMetricAction,
  ClearOutcomeRoleAction,
  ClearOutcomeStepAction,
  RemoveOutcomeAction,
  ReorderOutcomesAction,
  UpdateOutcomeAction,
} from "./actions.js";

export interface ProblemSheetOutcomesOperations {
  addOutcomeOperation: (
    state: ProblemSheetGlobalState,
    action: AddOutcomeAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateOutcomeOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateOutcomeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeOutcomeOperation: (
    state: ProblemSheetGlobalState,
    action: RemoveOutcomeAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderOutcomesOperation: (
    state: ProblemSheetGlobalState,
    action: ReorderOutcomesAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearOutcomeMetricOperation: (
    state: ProblemSheetGlobalState,
    action: ClearOutcomeMetricAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearOutcomeRoleOperation: (
    state: ProblemSheetGlobalState,
    action: ClearOutcomeRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearOutcomeStepOperation: (
    state: ProblemSheetGlobalState,
    action: ClearOutcomeStepAction,
    dispatch?: SignalDispatch,
  ) => void;
}
