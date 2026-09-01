/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type {
  SetWorkflowDescriptionAction,
  SetWorkflowNameAction,
  SetWorkflowStatusAction,
} from "./actions.js";

export interface WorkflowWorkflowOperations {
  setWorkflowNameOperation: (
    state: WorkflowGlobalState,
    action: SetWorkflowNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setWorkflowDescriptionOperation: (
    state: WorkflowGlobalState,
    action: SetWorkflowDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
  setWorkflowStatusOperation: (
    state: WorkflowGlobalState,
    action: SetWorkflowStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
}
