/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  AddTypefaceAction,
  RemoveTypefaceAction,
  ReorderTypefacesAction,
  UpdateTypefaceAction,
} from "./actions.js";

export interface BrandSheetTypographyOperations {
  addTypefaceOperation: (
    state: BrandSheetGlobalState,
    action: AddTypefaceAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTypefaceOperation: (
    state: BrandSheetGlobalState,
    action: UpdateTypefaceAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTypefaceOperation: (
    state: BrandSheetGlobalState,
    action: RemoveTypefaceAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderTypefacesOperation: (
    state: BrandSheetGlobalState,
    action: ReorderTypefacesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
