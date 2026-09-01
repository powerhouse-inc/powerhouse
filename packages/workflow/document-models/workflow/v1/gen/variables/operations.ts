/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type { RemoveVariableAction, SetVariableAction } from "./actions.js";

export interface WorkflowVariablesOperations {
  setVariableOperation: (
    state: WorkflowGlobalState,
    action: SetVariableAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeVariableOperation: (
    state: WorkflowGlobalState,
    action: RemoveVariableAction,
    dispatch?: SignalDispatch,
  ) => void;
}
