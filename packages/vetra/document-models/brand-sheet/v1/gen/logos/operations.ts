/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  AddLogoAction,
  ClearLogoAssetAction,
  RemoveLogoAction,
  ReorderLogosAction,
  SetLogoAssetAction,
  UpdateLogoAction,
} from "./actions.js";

export interface BrandSheetLogosOperations {
  addLogoOperation: (
    state: BrandSheetGlobalState,
    action: AddLogoAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateLogoOperation: (
    state: BrandSheetGlobalState,
    action: UpdateLogoAction,
    dispatch?: SignalDispatch,
  ) => void;
  setLogoAssetOperation: (
    state: BrandSheetGlobalState,
    action: SetLogoAssetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearLogoAssetOperation: (
    state: BrandSheetGlobalState,
    action: ClearLogoAssetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeLogoOperation: (
    state: BrandSheetGlobalState,
    action: RemoveLogoAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderLogosOperation: (
    state: BrandSheetGlobalState,
    action: ReorderLogosAction,
    dispatch?: SignalDispatch,
  ) => void;
}
