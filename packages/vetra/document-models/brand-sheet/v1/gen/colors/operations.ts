/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  AddColorAction,
  RemoveColorAction,
  ReorderColorsAction,
  UpdateColorAction,
} from "./actions.js";

export interface BrandSheetColorsOperations {
  addColorOperation: (
    state: BrandSheetGlobalState,
    action: AddColorAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateColorOperation: (
    state: BrandSheetGlobalState,
    action: UpdateColorAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeColorOperation: (
    state: BrandSheetGlobalState,
    action: RemoveColorAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderColorsOperation: (
    state: BrandSheetGlobalState,
    action: ReorderColorsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
