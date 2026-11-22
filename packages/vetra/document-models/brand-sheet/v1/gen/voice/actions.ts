/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearVoiceInput,
  SetVoiceInput,
  SetVoiceVocabularyInput,
  UpdateVoiceInput,
} from "../types.js";

export type SetVoiceAction = Action & {
  type: "SET_VOICE";
  input: SetVoiceInput;
};
export type UpdateVoiceAction = Action & {
  type: "UPDATE_VOICE";
  input: UpdateVoiceInput;
};
export type SetVoiceVocabularyAction = Action & {
  type: "SET_VOICE_VOCABULARY";
  input: SetVoiceVocabularyInput;
};
export type ClearVoiceAction = Action & {
  type: "CLEAR_VOICE";
  input: ClearVoiceInput;
};

export type BrandSheetVoiceAction =
  | SetVoiceAction
  | UpdateVoiceAction
  | SetVoiceVocabularyAction
  | ClearVoiceAction;
