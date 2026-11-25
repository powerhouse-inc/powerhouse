/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddSuggestionInputSchema,
  RemoveSuggestionInputSchema,
  ResolveSuggestionInputSchema,
  SetReadyForFeedbackInputSchema,
} from "../schema/zod.js";
import type {
  AddSuggestionInput,
  RemoveSuggestionInput,
  ResolveSuggestionInput,
  SetReadyForFeedbackInput,
} from "../types.js";
import type {
  AddSuggestionAction,
  RemoveSuggestionAction,
  ResolveSuggestionAction,
  SetReadyForFeedbackAction,
} from "./actions.js";

export const setReadyForFeedback = (input: SetReadyForFeedbackInput) =>
  createAction<SetReadyForFeedbackAction>(
    "SET_READY_FOR_FEEDBACK",
    { ...input },
    undefined,
    SetReadyForFeedbackInputSchema,
    "global",
  );

export const addSuggestion = (input: AddSuggestionInput) =>
  createAction<AddSuggestionAction>(
    "ADD_SUGGESTION",
    { ...input },
    undefined,
    AddSuggestionInputSchema,
    "global",
  );

export const resolveSuggestion = (input: ResolveSuggestionInput) =>
  createAction<ResolveSuggestionAction>(
    "RESOLVE_SUGGESTION",
    { ...input },
    undefined,
    ResolveSuggestionInputSchema,
    "global",
  );

export const removeSuggestion = (input: RemoveSuggestionInput) =>
  createAction<RemoveSuggestionAction>(
    "REMOVE_SUGGESTION",
    { ...input },
    undefined,
    RemoveSuggestionInputSchema,
    "global",
  );
