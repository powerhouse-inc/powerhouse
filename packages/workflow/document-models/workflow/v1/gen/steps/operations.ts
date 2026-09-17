/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type {
  AddStepAction,
  RemoveStepAction,
  SetStepConfigAction,
  UpdateStepAction,
} from "./actions.js";

export interface WorkflowStepsOperations {
  addStepOperation: (
    state: WorkflowGlobalState,
    action: AddStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateStepOperation: (
    state: WorkflowGlobalState,
    action: UpdateStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeStepOperation: (
    state: WorkflowGlobalState,
    action: RemoveStepAction,
    dispatch?: SignalDispatch,
  ) => void;
  setStepConfigOperation: (
    state: WorkflowGlobalState,
    action: SetStepConfigAction,
    dispatch?: SignalDispatch,
  ) => void;
}
