/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddSuggestionInput,
  RemoveSuggestionInput,
  ResolveSuggestionInput,
  SetReadyForFeedbackInput,
} from "../types.js";

export type SetReadyForFeedbackAction = Action & {
  type: "SET_READY_FOR_FEEDBACK";
  input: SetReadyForFeedbackInput;
};
export type AddSuggestionAction = Action & {
  type: "ADD_SUGGESTION";
  input: AddSuggestionInput;
};
export type ResolveSuggestionAction = Action & {
  type: "RESOLVE_SUGGESTION";
  input: ResolveSuggestionInput;
};
export type RemoveSuggestionAction = Action & {
  type: "REMOVE_SUGGESTION";
  input: RemoveSuggestionInput;
};

export type AudienceSheetAgentFeedbackAction =
  | SetReadyForFeedbackAction
  | AddSuggestionAction
  | ResolveSuggestionAction
  | RemoveSuggestionAction;
