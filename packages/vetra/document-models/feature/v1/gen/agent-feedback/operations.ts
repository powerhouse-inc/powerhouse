/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  AddSuggestionAction,
  RemoveSuggestionAction,
  ResolveSuggestionAction,
  SetReadyForFeedbackAction,
} from "./actions.js";

export interface FeatureAgentFeedbackOperations {
  setReadyForFeedbackOperation: (
    state: FeatureGlobalState,
    action: SetReadyForFeedbackAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSuggestionOperation: (
    state: FeatureGlobalState,
    action: AddSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  resolveSuggestionOperation: (
    state: FeatureGlobalState,
    action: ResolveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSuggestionOperation: (
    state: FeatureGlobalState,
    action: RemoveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
