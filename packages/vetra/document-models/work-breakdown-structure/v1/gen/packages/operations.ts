/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkBreakdownStructureGlobalState } from "../types.js";
import type {
  AddPackageAction,
  MovePackageAction,
  RemovePackageAction,
  ReorderPackagesAction,
  UpdatePackageAction,
} from "./actions.js";

export interface WorkBreakdownStructurePackagesOperations {
  addPackageOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: AddPackageAction,
    dispatch?: SignalDispatch,
  ) => void;
  updatePackageOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdatePackageAction,
    dispatch?: SignalDispatch,
  ) => void;
  movePackageOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: MovePackageAction,
    dispatch?: SignalDispatch,
  ) => void;
  removePackageOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: RemovePackageAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderPackagesOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ReorderPackagesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
