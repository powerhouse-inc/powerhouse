/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  ClearConceptAction,
  ClearMaximAction,
  ClearProductNameAction,
  SetConceptAction,
  SetMaximAction,
  SetProductNameAction,
} from "./actions.js";

export interface BrandSheetIdentityOperations {
  setProductNameOperation: (
    state: BrandSheetGlobalState,
    action: SetProductNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearProductNameOperation: (
    state: BrandSheetGlobalState,
    action: ClearProductNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setMaximOperation: (
    state: BrandSheetGlobalState,
    action: SetMaximAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearMaximOperation: (
    state: BrandSheetGlobalState,
    action: ClearMaximAction,
    dispatch?: SignalDispatch,
  ) => void;
  setConceptOperation: (
    state: BrandSheetGlobalState,
    action: SetConceptAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearConceptOperation: (
    state: BrandSheetGlobalState,
    action: ClearConceptAction,
    dispatch?: SignalDispatch,
  ) => void;
}
