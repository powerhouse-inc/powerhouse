/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkflowGlobalState } from "../types.js";
import type {
  ClearTriggerAction,
  SetTriggerAction,
  SetTriggerConfigAction,
  SetTriggerConnectionAction,
  SetTriggerPieceVersionAction,
} from "./actions.js";

export interface WorkflowTriggerOperations {
  setTriggerOperation: (
    state: WorkflowGlobalState,
    action: SetTriggerAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearTriggerOperation: (
    state: WorkflowGlobalState,
    action: ClearTriggerAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTriggerConfigOperation: (
    state: WorkflowGlobalState,
    action: SetTriggerConfigAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTriggerConnectionOperation: (
    state: WorkflowGlobalState,
    action: SetTriggerConnectionAction,
    dispatch?: SignalDispatch,
  ) => void;
  setTriggerPieceVersionOperation: (
    state: WorkflowGlobalState,
    action: SetTriggerPieceVersionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
