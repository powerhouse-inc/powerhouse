/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type { SetLastRunAction } from "./actions.js";

export interface WorkflowRuntimeOperations {
  setLastRunOperation: (
    state: WorkflowGlobalState,
    action: SetLastRunAction,
    dispatch?: SignalDispatch,
  ) => void;
}
