/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type { AddEdgeAction, RemoveEdgeAction } from "./actions.js";

export interface WorkflowEdgesOperations {
  addEdgeOperation: (
    state: WorkflowGlobalState,
    action: AddEdgeAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeEdgeOperation: (
    state: WorkflowGlobalState,
    action: RemoveEdgeAction,
    dispatch?: SignalDispatch,
  ) => void;
}
