/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type {
  AddJobStepAction,
  RemoveJobStepAction,
  ReorderJobStepsAction,
  UpdateJobStepAction,
} from "./actions.js";

export interface ProblemSheetJobStepsOperations {
  addJobStepOperation: (
    state: ProblemSheetGlobalState,
    action: AddJobStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateJobStepOperation: (
    state: ProblemSheetGlobalState,
    action: UpdateJobStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeJobStepOperation: (
    state: ProblemSheetGlobalState,
    action: RemoveJobStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderJobStepsOperation: (
    state: ProblemSheetGlobalState,
    action: ReorderJobStepsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
