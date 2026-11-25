/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WorkBreakdownStructureGlobalState } from "../types.js";
import type {
  ClearFeatureAction,
  ClearWbsDescriptionAction,
  ClearWbsNameAction,
  SetFeatureAction,
  SetWbsDescriptionAction,
  SetWbsNameAction,
  UpdateFeatureSnippetAction,
} from "./actions.js";

export interface WorkBreakdownStructureWbsMetaOperations {
  setWbsNameOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SetWbsNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearWbsNameOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ClearWbsNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setWbsDescriptionOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SetWbsDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearWbsDescriptionOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ClearWbsDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
  setFeatureOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: SetFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateFeatureSnippetOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: UpdateFeatureSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearFeatureOperation: (
    state: WorkBreakdownStructureGlobalState,
    action: ClearFeatureAction,
    dispatch?: SignalDispatch,
  ) => void;
}
