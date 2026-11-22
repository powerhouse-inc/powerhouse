/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProblemSheetGlobalState } from "../types.js";
import type {
  AddSuggestionAction,
  RemoveSuggestionAction,
  ResolveSuggestionAction,
  SetReadyForFeedbackAction,
} from "./actions.js";

export interface ProblemSheetAgentFeedbackOperations {
  setReadyForFeedbackOperation: (
    state: ProblemSheetGlobalState,
    action: SetReadyForFeedbackAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSuggestionOperation: (
    state: ProblemSheetGlobalState,
    action: AddSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  resolveSuggestionOperation: (
    state: ProblemSheetGlobalState,
    action: ResolveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSuggestionOperation: (
    state: ProblemSheetGlobalState,
    action: RemoveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
