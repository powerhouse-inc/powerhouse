/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  AddImageryReferenceAction,
  ClearImageryDirectionAction,
  RemoveImageryReferenceAction,
  ReorderImageryReferencesAction,
  SetImageryDirectionAction,
  SetImageryGuidanceAction,
} from "./actions.js";

export interface BrandSheetImageryOperations {
  setImageryDirectionOperation: (
    state: BrandSheetGlobalState,
    action: SetImageryDirectionAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearImageryDirectionOperation: (
    state: BrandSheetGlobalState,
    action: ClearImageryDirectionAction,
    dispatch?: SignalDispatch,
  ) => void;
  setImageryGuidanceOperation: (
    state: BrandSheetGlobalState,
    action: SetImageryGuidanceAction,
    dispatch?: SignalDispatch,
  ) => void;
  addImageryReferenceOperation: (
    state: BrandSheetGlobalState,
    action: AddImageryReferenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeImageryReferenceOperation: (
    state: BrandSheetGlobalState,
    action: RemoveImageryReferenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderImageryReferencesOperation: (
    state: BrandSheetGlobalState,
    action: ReorderImageryReferencesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
