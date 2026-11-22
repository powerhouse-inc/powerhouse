/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { AudienceSheetGlobalState } from "../types.js";
import type {
  AddSuggestionAction,
  RemoveSuggestionAction,
  ResolveSuggestionAction,
  SetReadyForFeedbackAction,
} from "./actions.js";

export interface AudienceSheetAgentFeedbackOperations {
  setReadyForFeedbackOperation: (
    state: AudienceSheetGlobalState,
    action: SetReadyForFeedbackAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSuggestionOperation: (
    state: AudienceSheetGlobalState,
    action: AddSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  resolveSuggestionOperation: (
    state: AudienceSheetGlobalState,
    action: ResolveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSuggestionOperation: (
    state: AudienceSheetGlobalState,
    action: RemoveSuggestionAction,
    dispatch?: SignalDispatch,
  ) => void;
}
