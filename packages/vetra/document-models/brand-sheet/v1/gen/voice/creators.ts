/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearVoiceInputSchema,
  SetVoiceInputSchema,
  SetVoiceVocabularyInputSchema,
  UpdateVoiceInputSchema,
} from "../schema/zod.js";
import type {
  ClearVoiceInput,
  SetVoiceInput,
  SetVoiceVocabularyInput,
  UpdateVoiceInput,
} from "../types.js";
import type {
  ClearVoiceAction,
  SetVoiceAction,
  SetVoiceVocabularyAction,
  UpdateVoiceAction,
} from "./actions.js";

export const setVoice = (input: SetVoiceInput) =>
  createAction<SetVoiceAction>(
    "SET_VOICE",
    { ...input },
    undefined,
    SetVoiceInputSchema,
    "global",
  );

export const updateVoice = (input: UpdateVoiceInput) =>
  createAction<UpdateVoiceAction>(
    "UPDATE_VOICE",
    { ...input },
    undefined,
    UpdateVoiceInputSchema,
    "global",
  );

export const setVoiceVocabulary = (input: SetVoiceVocabularyInput) =>
  createAction<SetVoiceVocabularyAction>(
    "SET_VOICE_VOCABULARY",
    { ...input },
    undefined,
    SetVoiceVocabularyInputSchema,
    "global",
  );

export const clearVoice = (input: ClearVoiceInput) =>
  createAction<ClearVoiceAction>(
    "CLEAR_VOICE",
    { ...input },
    undefined,
    ClearVoiceInputSchema,
    "global",
  );
