/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type { SetPolicyAction } from "./actions.js";

export interface WorkflowPolicyOperations {
  setPolicyOperation: (
    state: WorkflowGlobalState,
    action: SetPolicyAction,
    dispatch?: SignalDispatch,
  ) => void;
}
