/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkBreakdownStructureGlobalState } from "../types.js";
import type {
  ActivateWbsAction,
  ArchiveWbsAction,
  CompleteWbsAction,
  ReopenWbsAction,
} from "./actions.js";

export interface WorkBreakdownStructureWbsStatusOperations {
  activateWbsOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ActivateWbsAction,
    dispatch?: SignalDispatch,
  ) => void;
  completeWbsOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: CompleteWbsAction,
    dispatch?: SignalDispatch,
  ) => void;
  archiveWbsOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ArchiveWbsAction,
    dispatch?: SignalDispatch,
  ) => void;
  reopenWbsOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ReopenWbsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
