/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  AddSuggestionAction,
  RemoveSuggestionAction,
  ResolveSuggestionAction,
  SetReadyForFeedbackAction,
} from "./actions.js";

export interface BrandSheetAgentFeedbackOperations {
  setReadyForFeedbackOperation: (
    state: BrandSheetGlobalState,
    action: SetReadyForFeedbackAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSuggestionOperation: (
    state: BrandSheetGlobalState,
    action: AddSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  resolveSuggestionOperation: (
    state: BrandSheetGlobalState,
    action: ResolveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSuggestionOperation: (
    state: BrandSheetGlobalState,
    action: RemoveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
